package com.smarttuition.app.data.model

import kotlinx.serialization.Serializable

// ---------------------------------------------------------------------------
// DTOs mirroring the Smart Tuition REST API (see docs/API.md).
// Unknown JSON keys are ignored, so the server can add fields without breaking old app versions.
// ---------------------------------------------------------------------------

@Serializable
enum class Role { PARENT, TUTOR, ADMIN }

@Serializable
data class User(
    val id: String,
    val role: Role,
    val fullName: String,
    val phone: String,
    val email: String? = null,
    val phoneVerified: Boolean = false,
    val status: String = "ACTIVE",
    val photoUrl: String? = null,
    val tutorVerificationStatus: String? = null,
    val profileComplete: Boolean = false,
)

// ---------- Auth ----------
@Serializable data class RegisterRequest(val role: Role, val fullName: String, val phone: String, val email: String)
@Serializable data class PhoneRequest(val phone: String)
@Serializable data class VerifyOtpRequest(val phone: String, val code: String)
@Serializable data class RefreshRequest(val refreshToken: String)
@Serializable data class FcmTokenRequest(val token: String?)
@Serializable data class OtpSent(val otpSentTo: String, val expiresInSeconds: Int, val devOtp: String? = null)
@Serializable
data class AuthTokens(
    val accessToken: String,
    val refreshToken: String,
    val accessTokenExpiresAt: String,
    val user: User,
)

// ---------- Reference data ----------
@Serializable data class IdName(val id: Int, val name: String)
@Serializable data class Board(val id: Int, val name: String, val code: String)
@Serializable data class MetaData(val classes: List<IdName>, val boards: List<Board>, val subjects: List<IdName>)
@Serializable
data class Location(
    val id: Int,
    val locality: String,
    val city: String,
    val state: String,
    val pincode: String,
    val latitude: Double,
    val longitude: Double,
) {
    val label: String get() = "$locality, $city - $pincode"
}

@Serializable
data class Paged<T>(
    val items: List<T>,
    val page: Int,
    val pageSize: Int,
    val total: Int,
    val totalPages: Int,
)

// ---------- Parent ----------
@Serializable
data class Student(
    val id: String,
    val name: String,
    val classId: Int,
    val className: String,
    val boardId: Int? = null,
    val boardCode: String? = null,
    val schoolName: String? = null,
    val gender: String? = null,
)

@Serializable
data class StudentRequest(
    val name: String,
    val classId: Int,
    val boardId: Int? = null,
    val schoolName: String? = null,
    val gender: String? = null,
)

@Serializable
data class ParentProfile(
    val id: String,
    val fullName: String,
    val phone: String,
    val email: String? = null,
    val addressLine: String? = null,
    val locationId: Int? = null,
    val city: String? = null,
    val pincode: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val students: List<Student> = emptyList(),
)

@Serializable
data class ParentProfileUpdate(
    val fullName: String? = null,
    val email: String? = null,
    val addressLine: String? = null,
    val locationId: Int? = null,
    val city: String? = null,
    val pincode: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
)

// ---------- Tutor ----------
@Serializable
data class TutorCard(
    val id: String,
    val fullName: String,
    val photoUrl: String? = null,
    val headline: String? = null,
    val gender: String? = null,
    val experienceYears: Int = 0,
    val monthlyFee: Int? = null,
    val teachingMode: String = "OFFLINE",
    val locality: String? = null,
    val city: String? = null,
    val avgRating: Double = 0.0,
    val reviewCount: Int = 0,
    val isFeatured: Boolean = false,
    val distanceKm: Double? = null,
    val subjects: List<IdName> = emptyList(),
    val classes: List<IdName> = emptyList(),
)

@Serializable data class Qualification(val id: String? = null, val degree: String, val institution: String? = null, val year: Int? = null)
@Serializable data class AvailabilitySlot(val id: String? = null, val dayOfWeek: Int, val startTime: String, val endTime: String)
@Serializable
data class TutorDocument(
    val id: String,
    val docType: String,
    val originalName: String,
    val mimeType: String,
    val sizeBytes: Long,
    val status: String,
    val reviewNote: String? = null,
    val uploadedAt: String,
)
@Serializable data class Completeness(val complete: Boolean, val missing: List<String> = emptyList())

@Serializable
data class TutorOwnProfile(
    val id: String,
    val fullName: String,
    val phone: String,
    val email: String? = null,
    val photoUrl: String? = null,
    val headline: String? = null,
    val bio: String? = null,
    val gender: String? = null,
    val experienceYears: Int = 0,
    val experienceDetails: String? = null,
    val monthlyFee: Int? = null,
    val teachingMode: String = "OFFLINE",
    val locationId: Int? = null,
    val locality: String? = null,
    val city: String? = null,
    val pincode: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val serviceRadiusKm: Int = 5,
    val isAvailable: Boolean = true,
    val isFeatured: Boolean = false,
    val avgRating: Double = 0.0,
    val reviewCount: Int = 0,
    val verificationStatus: String = "DRAFT",
    val verificationNote: String? = null,
    val subjects: List<IdName> = emptyList(),
    val classes: List<IdName> = emptyList(),
    val boards: List<Board> = emptyList(),
    val qualifications: List<Qualification> = emptyList(),
    val availability: List<AvailabilitySlot> = emptyList(),
    val documents: List<TutorDocument> = emptyList(),
    val completeness: Completeness? = null,
)

@Serializable
data class TutorProfileUpdate(
    val fullName: String? = null,
    val email: String? = null,
    val headline: String? = null,
    val bio: String? = null,
    val gender: String? = null,
    val experienceYears: Int? = null,
    val experienceDetails: String? = null,
    val monthlyFee: Int? = null,
    val teachingMode: String? = null,
    val locationId: Int? = null,
    val locality: String? = null,
    val city: String? = null,
    val pincode: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val serviceRadiusKm: Int? = null,
    val subjectIds: List<Int>? = null,
    val classIds: List<Int>? = null,
    val boardIds: List<Int>? = null,
)

@Serializable data class QualificationInput(val degree: String, val institution: String? = null, val year: Int? = null)
@Serializable data class QualificationsRequest(val qualifications: List<QualificationInput>)
@Serializable data class SlotInput(val dayOfWeek: Int, val startTime: String, val endTime: String)
@Serializable data class AvailabilityRequest(val slots: List<SlotInput>)
@Serializable data class AvailabilityStatus(val isAvailable: Boolean)
@Serializable data class PhotoResponse(val photoUrl: String)
@Serializable data class VerificationResponse(val verificationStatus: String)

@Serializable data class Review(val id: String, val rating: Int, val comment: String? = null, val createdAt: String, val parentName: String)
@Serializable data class Connection(val applicationId: String, val status: String, val initiatedBy: String)
@Serializable data class Contact(val phone: String, val email: String? = null)

@Serializable
data class TutorPublicProfile(
    val id: String,
    val fullName: String,
    val photoUrl: String? = null,
    val headline: String? = null,
    val bio: String? = null,
    val gender: String? = null,
    val experienceYears: Int = 0,
    val experienceDetails: String? = null,
    val monthlyFee: Int? = null,
    val teachingMode: String = "OFFLINE",
    val locality: String? = null,
    val city: String? = null,
    val serviceRadiusKm: Int = 5,
    val isAvailable: Boolean = true,
    val isFeatured: Boolean = false,
    val avgRating: Double = 0.0,
    val reviewCount: Int = 0,
    val approxLatitude: Double? = null,
    val approxLongitude: Double? = null,
    val subjects: List<IdName> = emptyList(),
    val classes: List<IdName> = emptyList(),
    val boards: List<Board> = emptyList(),
    val qualifications: List<Qualification> = emptyList(),
    val availability: List<AvailabilitySlot> = emptyList(),
    val verifiedDocuments: Int = 0,
    val contact: Contact? = null,
    val connection: Connection? = null,
    val reviews: List<Review> = emptyList(),
)

// ---------- Requirements ----------
@Serializable
data class Requirement(
    val id: String,
    val classId: Int,
    val className: String,
    val boardId: Int? = null,
    val boardCode: String? = null,
    val daysPerWeek: Int,
    val preferredTime: String,
    val preferredTutorGender: String = "ANY",
    val monthlyBudget: Int,
    val mode: String,
    val locality: String? = null,
    val city: String,
    val pincode: String,
    val additionalNotes: String? = null,
    val status: String,
    val createdAt: String,
    val studentGender: String? = null,
    val subjects: List<IdName> = emptyList(),
    // Owner (parent) view only
    val studentId: String? = null,
    val studentName: String? = null,
    val applicationCount: Int? = null,
    val pendingApplications: Int? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    // Tutor view only
    val approxLatitude: Double? = null,
    val approxLongitude: Double? = null,
    val distanceKm: Double? = null,
    val hasApplied: Boolean = false,
    val isSaved: Boolean = false,
    val applicationId: String? = null,
    val applicationStatus: String? = null,
)

@Serializable
data class RequirementRequest(
    val studentId: String,
    val subjectIds: List<Int>,
    val daysPerWeek: Int,
    val preferredTime: String,
    val preferredTutorGender: String,
    val monthlyBudget: Int,
    val mode: String,
    val locationId: Int? = null,
    val locality: String? = null,
    val city: String? = null,
    val pincode: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val additionalNotes: String? = null,
)

@Serializable data class SavedResponse(val isSaved: Boolean)

// ---------- Applications ----------
@Serializable
data class AppRequirement(
    val id: String,
    val className: String? = null,
    val subjects: List<IdName> = emptyList(),
    val city: String? = null,
    val locality: String? = null,
    val mode: String? = null,
    val monthlyBudget: Int? = null,
    val preferredTime: String? = null,
)
@Serializable
data class AppTutor(
    val id: String,
    val fullName: String,
    val photoUrl: String? = null,
    val headline: String? = null,
    val experienceYears: Int = 0,
    val avgRating: Double = 0.0,
    val reviewCount: Int = 0,
    val monthlyFee: Int? = null,
    val contact: Contact? = null,
)
@Serializable data class AppParent(val id: String, val fullName: String, val contact: Contact? = null)
@Serializable data class AppStudent(val id: String, val name: String? = null, val className: String? = null)

@Serializable
data class TuitionApplication(
    val id: String,
    val status: String,
    val initiatedBy: String,
    val direction: String,
    val message: String? = null,
    val proposedFee: Int? = null,
    val createdAt: String,
    val respondedAt: String? = null,
    val canRespond: Boolean = false,
    val canWithdraw: Boolean = false,
    val requirement: AppRequirement? = null,
    val tutor: AppTutor,
    val parent: AppParent,
    val student: AppStudent? = null,
    val bookingId: String? = null,
    val bookingStatus: String? = null,
    val conversationId: String? = null,
)

@Serializable data class ApplyRequest(val requirementId: String, val message: String? = null, val proposedFee: Int? = null)
@Serializable data class DirectRequest(val tutorId: String, val studentId: String, val message: String? = null)

// ---------- Notifications ----------
@Serializable
data class AppNotification(
    val id: String,
    val type: String,
    val title: String,
    val body: String,
    val data: Map<String, String> = emptyMap(),
    val readAt: String? = null,
    val createdAt: String,
)

@Serializable
data class NotificationPage(
    val items: List<AppNotification>,
    val page: Int,
    val pageSize: Int,
    val total: Int,
    val totalPages: Int,
    val unread: Int,
)

@Serializable data class UnreadCount(val unread: Int)
