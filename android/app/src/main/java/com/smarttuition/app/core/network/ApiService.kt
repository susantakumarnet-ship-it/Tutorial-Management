package com.smarttuition.app.core.network

import com.smarttuition.app.data.model.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.*

interface ApiService {

    // ---------------- Auth ----------------
    @POST("auth/register") suspend fun register(@Body body: RegisterRequest): OtpSent
    @POST("auth/login") suspend fun login(@Body body: PhoneRequest): OtpSent
    @POST("auth/verify-otp") suspend fun verifyOtp(@Body body: VerifyOtpRequest): AuthTokens
    @POST("auth/logout") suspend fun logout(@Body body: RefreshRequest)
    @GET("auth/me") suspend fun me(): User
    @PUT("auth/fcm-token") suspend fun updateFcmToken(@Body body: FcmTokenRequest)

    // ---------------- Reference data ----------------
    @GET("meta") suspend fun meta(): MetaData
    @GET("meta/locations") suspend fun locations(@Query("q") q: String?, @Query("limit") limit: Int = 20): List<Location>

    // ---------------- Parent ----------------
    @GET("parents/me") suspend fun parentProfile(): ParentProfile
    @PUT("parents/me") suspend fun updateParentProfile(@Body body: ParentProfileUpdate): ParentProfile
    @POST("parents/me/students") suspend fun addStudent(@Body body: StudentRequest): Student
    @PUT("parents/me/students/{id}") suspend fun updateStudent(@Path("id") id: String, @Body body: StudentRequest): Student
    @DELETE("parents/me/students/{id}") suspend fun deleteStudent(@Path("id") id: String)

    // ---------------- Tutor (self) ----------------
    @GET("tutors/me") suspend fun tutorProfile(): TutorOwnProfile
    @PUT("tutors/me") suspend fun updateTutorProfile(@Body body: TutorProfileUpdate): TutorOwnProfile
    @PUT("tutors/me/qualifications") suspend fun updateQualifications(@Body body: QualificationsRequest): List<Qualification>
    @PUT("tutors/me/availability") suspend fun updateAvailability(@Body body: AvailabilityRequest): List<AvailabilitySlot>
    @PATCH("tutors/me/availability-status") suspend fun setAvailable(@Body body: AvailabilityStatus): AvailabilityStatus
    @Multipart @POST("tutors/me/photo") suspend fun uploadPhoto(@Part photo: MultipartBody.Part): PhotoResponse
    @Multipart @POST("tutors/me/documents")
    suspend fun uploadDocument(@Part("docType") docType: RequestBody, @Part file: MultipartBody.Part): TutorDocument
    @DELETE("tutors/me/documents/{id}") suspend fun deleteDocument(@Path("id") id: String)
    @POST("tutors/me/submit-for-verification") suspend fun submitForVerification(): VerificationResponse

    // ---------------- Tutor discovery (parents) ----------------
    @GET("tutors/search") suspend fun searchTutors(@QueryMap filters: Map<String, String>): Paged<TutorCard>
    @GET("tutors/{id}") suspend fun tutorPublicProfile(@Path("id") id: String): TutorPublicProfile

    // ---------------- Requirements ----------------
    @POST("requirements") suspend fun createRequirement(@Body body: RequirementRequest): Requirement
    @PUT("requirements/{id}") suspend fun updateRequirement(@Path("id") id: String, @Body body: RequirementRequest): Requirement
    @GET("requirements/mine") suspend fun myRequirements(@Query("status") status: String? = null): List<Requirement>
    @POST("requirements/{id}/close") suspend fun closeRequirement(@Path("id") id: String): Requirement
    @GET("requirements/{id}") suspend fun requirement(@Path("id") id: String): Requirement
    @GET("requirements/discover") suspend fun discoverRequirements(@QueryMap filters: Map<String, String>): Paged<Requirement>
    @GET("requirements/saved") suspend fun savedRequirements(@Query("page") page: Int = 1): Paged<Requirement>
    @PUT("requirements/{id}/save") suspend fun saveRequirement(@Path("id") id: String): SavedResponse
    @DELETE("requirements/{id}/save") suspend fun unsaveRequirement(@Path("id") id: String): SavedResponse

    // ---------------- Applications ----------------
    @POST("applications") suspend fun apply(@Body body: ApplyRequest): TuitionApplication
    @POST("applications/direct") suspend fun requestTutor(@Body body: DirectRequest): TuitionApplication
    @GET("applications")
    suspend fun applications(
        @Query("box") box: String? = null,
        @Query("status") status: String? = null,
        @Query("requirementId") requirementId: String? = null,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 50,
    ): Paged<TuitionApplication>
    @GET("applications/{id}") suspend fun application(@Path("id") id: String): TuitionApplication
    @POST("applications/{id}/accept") suspend fun accept(@Path("id") id: String): TuitionApplication
    @POST("applications/{id}/reject") suspend fun reject(@Path("id") id: String): TuitionApplication
    @POST("applications/{id}/withdraw") suspend fun withdraw(@Path("id") id: String): TuitionApplication

    // ---------------- Notifications ----------------
    @GET("notifications") suspend fun notifications(@Query("page") page: Int = 1): NotificationPage
    @GET("notifications/unread-count") suspend fun unreadCount(): UnreadCount
    @POST("notifications/{id}/read") suspend fun markRead(@Path("id") id: String)
    @POST("notifications/read-all") suspend fun markAllRead()
}
