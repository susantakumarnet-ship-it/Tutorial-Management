package com.smarttuition.app.ui.navigation

import kotlinx.serialization.Serializable

// Type-safe navigation destinations (Navigation Compose 2.8+).

// ---- Onboarding & auth ----
@Serializable data object WelcomeRoute
@Serializable data object RoleSelectRoute
@Serializable data class RegisterRoute(val role: String)
@Serializable data object LoginRoute
@Serializable data class OtpRoute(val phone: String, val masked: String, val devOtp: String? = null)

// ---- Parent ----
@Serializable data object ParentHomeRoute
@Serializable data object SearchTutorsRoute
@Serializable data object ParentRequestsRoute
@Serializable data object ManageChildrenRoute
@Serializable data class PostRequirementRoute(val requirementId: String? = null)
@Serializable data class ParentRequirementDetailRoute(val id: String)
@Serializable data class TutorProfileRoute(val id: String)

// ---- Tutor ----
@Serializable data object TutorHomeRoute
@Serializable data object FindStudentsRoute
@Serializable data object TutorApplicationsRoute
@Serializable data object EditTutorProfileRoute
@Serializable data class TutorRequirementDetailRoute(val id: String)

// ---- Shared ----
@Serializable data class ApplicationDetailRoute(val id: String)
@Serializable data object NotificationsRoute
@Serializable data object AccountRoute
