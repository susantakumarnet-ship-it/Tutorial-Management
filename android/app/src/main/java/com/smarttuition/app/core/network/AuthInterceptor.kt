package com.smarttuition.app.core.network

import com.smarttuition.app.BuildConfig
import com.smarttuition.app.core.session.SessionManager
import com.smarttuition.app.core.session.TokenStore
import com.smarttuition.app.core.session.Tokens
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import javax.inject.Inject
import javax.inject.Singleton

/** Adds the bearer token to every request except the public auth endpoints. */
class AuthInterceptor @Inject constructor(private val tokens: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val token = tokens.current()?.access
        val isPublic = PUBLIC_PATHS.any { request.url.encodedPath.endsWith(it) }
        if (token == null || isPublic) return chain.proceed(request)
        return chain.proceed(request.newBuilder().header("Authorization", "Bearer $token").build())
    }

    private companion object {
        val PUBLIC_PATHS = listOf("/auth/register", "/auth/login", "/auth/verify-otp", "/auth/refresh", "/auth/logout", "/meta")
    }
}

@Serializable private data class RefreshBody(val refreshToken: String)
@Serializable private data class RefreshResult(val accessToken: String, val refreshToken: String)

/**
 * On HTTP 401, rotates the refresh token once and retries the request. Concurrent 401s share a single
 * refresh. If refreshing fails the session is cleared and the app returns to the welcome screen.
 */
@Singleton
class TokenAuthenticator @Inject constructor(
    private val tokens: TokenStore,
    private val session: SessionManager,
    private val json: Json,
) : Authenticator {

    private val plainClient = OkHttpClient()
    private val lock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.header("Authorization") == null) return null
        if (responseCount(response) >= 2) return null
        val failedToken = response.request.header("Authorization")!!.removePrefix("Bearer ")

        synchronized(lock) {
            val current = tokens.current() ?: return null
            // Another thread already refreshed while we waited.
            if (current.access != failedToken) return retry(response.request, current.access)

            val refreshed = refresh(current.refresh)
            if (refreshed == null) {
                runBlocking { tokens.clear() }
                session.signedOut()
                return null
            }
            runBlocking { tokens.save(refreshed) }
            return retry(response.request, refreshed.access)
        }
    }

    private fun refresh(refreshToken: String): Tokens? = runCatching {
        val body = json.encodeToString(RefreshBody.serializer(), RefreshBody(refreshToken))
            .toRequestBody("application/json".toMediaType())
        val request = Request.Builder().url(BuildConfig.API_BASE_URL + "auth/refresh").post(body).build()
        plainClient.newCall(request).execute().use { res ->
            if (!res.isSuccessful) return null
            val parsed = json.decodeFromString(RefreshResult.serializer(), res.body!!.string())
            Tokens(parsed.accessToken, parsed.refreshToken)
        }
    }.getOrNull()

    private fun retry(request: Request, token: String) =
        request.newBuilder().header("Authorization", "Bearer $token").build()

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
