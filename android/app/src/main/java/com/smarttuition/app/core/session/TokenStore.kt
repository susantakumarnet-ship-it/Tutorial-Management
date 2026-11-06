package com.smarttuition.app.core.session

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

private val Context.sessionStore by preferencesDataStore(name = "session")

data class Tokens(val access: String, val refresh: String)

/**
 * Persists the session tokens in DataStore, encrypted with an AES-256-GCM key that never leaves the
 * Android Keystore. An in-memory copy avoids disk reads on every request.
 */
@Singleton
class TokenStore @Inject constructor(@ApplicationContext private val context: Context) {

    private val accessKey = stringPreferencesKey("access")
    private val refreshKey = stringPreferencesKey("refresh")

    @Volatile private var cache: Tokens? = null
    @Volatile private var loaded = false

    fun current(): Tokens? = cache

    suspend fun load(): Tokens? {
        if (loaded) return cache
        val prefs = context.sessionStore.data.first()
        val access = prefs[accessKey]?.let(KeystoreCipher::decrypt)
        val refresh = prefs[refreshKey]?.let(KeystoreCipher::decrypt)
        cache = if (access != null && refresh != null) Tokens(access, refresh) else null
        loaded = true
        return cache
    }

    suspend fun save(tokens: Tokens) {
        cache = tokens
        loaded = true
        context.sessionStore.edit {
            it[accessKey] = KeystoreCipher.encrypt(tokens.access)
            it[refreshKey] = KeystoreCipher.encrypt(tokens.refresh)
        }
    }

    suspend fun clear() {
        cache = null
        loaded = true
        context.sessionStore.edit { it.clear() }
    }
}

private object KeystoreCipher {
    private const val ALIAS = "smart_tuition_session_key"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val out = cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(out, Base64.NO_WRAP)
    }

    /** Returns null when the value cannot be decrypted (e.g. key invalidated) - the user simply logs in again. */
    fun decrypt(encoded: String): String? = runCatching {
        val bytes = Base64.decode(encoded, Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, 12))
        String(cipher.doFinal(bytes, 12, bytes.size - 12), Charsets.UTF_8)
    }.getOrNull()
}
