package com.smarttuition.app.data.repository

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.smarttuition.app.core.network.ApiResult
import com.smarttuition.app.core.network.ApiService
import com.smarttuition.app.core.network.apiCall
import com.smarttuition.app.core.session.SessionManager
import com.smarttuition.app.core.session.TokenStore
import com.smarttuition.app.core.session.Tokens
import com.smarttuition.app.data.model.*
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.HttpException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val api: ApiService,
    private val tokens: TokenStore,
    private val session: SessionManager,
) {
    suspend fun register(role: Role, fullName: String, phone: String, email: String) =
        apiCall { api.register(RegisterRequest(role, fullName, phone, email)) }

    suspend fun requestLoginOtp(phone: String) = apiCall { api.login(PhoneRequest(phone)) }

    suspend fun verifyOtp(phone: String, code: String): ApiResult<User> {
        val result = apiCall { api.verifyOtp(VerifyOtpRequest(phone, code)) }
        return when (result) {
            is ApiResult.Success -> {
                tokens.save(Tokens(result.data.accessToken, result.data.refreshToken))
                session.signedIn(result.data.user)
                ApiResult.Success(result.data.user)
            }
            is ApiResult.Failure -> result
        }
    }

    /** Called at start-up: resumes a stored session if the server still accepts it. */
    suspend fun restoreSession() {
        if (tokens.load() == null) {
            session.signedOut()
            return
        }
        try {
            session.signedIn(api.me())
        } catch (e: HttpException) {
            // 401 after a failed refresh or a blocked account (403): start fresh.
            tokens.clear()
            session.signedOut()
        } catch (e: Exception) {
            // Offline: keep tokens and try again next launch, but we can't show role-specific screens yet.
            session.signedOut()
        }
    }

    /** Re-fetches the user (e.g. after completing the profile) so dashboards reflect the latest state. */
    suspend fun refreshUser(): ApiResult<User> = apiCall { api.me() }.also { r ->
        if (r is ApiResult.Success) session.signedIn(r.data)
    }

    suspend fun logout() {
        tokens.current()?.refresh?.let { refresh -> apiCall { api.logout(RefreshRequest(refresh)) } }
        tokens.clear()
        session.signedOut()
    }
}

/** Reference lists change rarely, so they're fetched once per app run. */
@Singleton
class MetaRepository @Inject constructor(private val api: ApiService) {
    private val mutex = Mutex()
    private var cached: MetaData? = null

    suspend fun meta(): ApiResult<MetaData> = mutex.withLock {
        cached?.let { return ApiResult.Success(it) }
        apiCall { api.meta() }.also { if (it is ApiResult.Success) cached = it.data }
    }

    suspend fun searchLocations(q: String) = apiCall { api.locations(q.ifBlank { null }) }
}

@Singleton
class ParentRepository @Inject constructor(private val api: ApiService) {
    suspend fun profile() = apiCall { api.parentProfile() }
    suspend fun updateProfile(update: ParentProfileUpdate) = apiCall { api.updateParentProfile(update) }
    suspend fun addStudent(req: StudentRequest) = apiCall { api.addStudent(req) }
    suspend fun updateStudent(id: String, req: StudentRequest) = apiCall { api.updateStudent(id, req) }
    suspend fun deleteStudent(id: String) = apiCall { api.deleteStudent(id) }
}

@Singleton
class TutorRepository @Inject constructor(
    private val api: ApiService,
    @ApplicationContext private val context: Context,
) {
    suspend fun myProfile() = apiCall { api.tutorProfile() }
    suspend fun updateProfile(update: TutorProfileUpdate) = apiCall { api.updateTutorProfile(update) }
    suspend fun updateQualifications(list: List<QualificationInput>) = apiCall { api.updateQualifications(QualificationsRequest(list)) }
    suspend fun updateAvailability(slots: List<SlotInput>) = apiCall { api.updateAvailability(AvailabilityRequest(slots)) }
    suspend fun setAvailable(available: Boolean) = apiCall { api.setAvailable(AvailabilityStatus(available)) }
    suspend fun submitForVerification() = apiCall { api.submitForVerification() }
    suspend fun deleteDocument(id: String) = apiCall { api.deleteDocument(id) }

    suspend fun uploadPhoto(uri: Uri): ApiResult<PhotoResponse> {
        val part = readPart(uri, "photo") ?: return ApiResult.Failure(FILE_ERROR)
        return apiCall { api.uploadPhoto(part) }
    }

    suspend fun uploadDocument(uri: Uri, docType: String): ApiResult<TutorDocument> {
        val part = readPart(uri, "file") ?: return ApiResult.Failure(FILE_ERROR)
        return apiCall { api.uploadDocument(docType.toRequestBody("text/plain".toMediaType()), part) }
    }

    suspend fun search(filters: Map<String, String>) = apiCall { api.searchTutors(filters) }
    suspend fun publicProfile(id: String) = apiCall { api.tutorPublicProfile(id) }

    /** Reads a picked file into a multipart part, enforcing the server's 5 MB limit up-front. */
    private suspend fun readPart(uri: Uri, field: String): MultipartBody.Part? = withContext(Dispatchers.IO) {
        runCatching {
            val resolver = context.contentResolver
            val mime = resolver.getType(uri) ?: "application/octet-stream"
            val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) c.getString(0) else null
            } ?: "upload"
            val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: return@runCatching null
            if (bytes.size > MAX_BYTES) return@runCatching null
            MultipartBody.Part.createFormData(field, name, bytes.toRequestBody(mime.toMediaType()))
        }.getOrNull()
    }

    private companion object {
        const val MAX_BYTES = 5 * 1024 * 1024
        const val FILE_ERROR = "Couldn't read that file. Choose a PDF, JPG or PNG under 5 MB."
    }
}

@Singleton
class RequirementRepository @Inject constructor(private val api: ApiService) {
    suspend fun create(req: RequirementRequest) = apiCall { api.createRequirement(req) }
    suspend fun update(id: String, req: RequirementRequest) = apiCall { api.updateRequirement(id, req) }
    suspend fun mine() = apiCall { api.myRequirements() }
    suspend fun close(id: String) = apiCall { api.closeRequirement(id) }
    suspend fun get(id: String) = apiCall { api.requirement(id) }
    suspend fun discover(filters: Map<String, String>) = apiCall { api.discoverRequirements(filters) }
    suspend fun saved() = apiCall { api.savedRequirements() }
    suspend fun setSaved(id: String, saved: Boolean) = apiCall { if (saved) api.saveRequirement(id) else api.unsaveRequirement(id) }
}

@Singleton
class ApplicationRepository @Inject constructor(private val api: ApiService) {
    suspend fun apply(requirementId: String, message: String?, proposedFee: Int?) =
        apiCall { api.apply(ApplyRequest(requirementId, message, proposedFee)) }
    suspend fun requestTutor(tutorId: String, studentId: String, message: String?) =
        apiCall { api.requestTutor(DirectRequest(tutorId, studentId, message)) }
    suspend fun list(box: String? = null, status: String? = null, requirementId: String? = null) =
        apiCall { api.applications(box = box, status = status, requirementId = requirementId) }
    suspend fun get(id: String) = apiCall { api.application(id) }
    suspend fun accept(id: String) = apiCall { api.accept(id) }
    suspend fun reject(id: String) = apiCall { api.reject(id) }
    suspend fun withdraw(id: String) = apiCall { api.withdraw(id) }
}

@Singleton
class NotificationRepository @Inject constructor(private val api: ApiService) {
    suspend fun list() = apiCall { api.notifications() }
    suspend fun unreadCount() = apiCall { api.unreadCount() }
    suspend fun markRead(id: String) = apiCall { api.markRead(id) }
    suspend fun markAllRead() = apiCall { api.markAllRead() }
}
