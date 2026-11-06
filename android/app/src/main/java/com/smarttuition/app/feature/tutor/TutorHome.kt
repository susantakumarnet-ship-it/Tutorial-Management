@file:OptIn(ExperimentalMaterial3Api::class)

package com.smarttuition.app.feature.tutor

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.smarttuition.app.core.network.ApiResult
import com.smarttuition.app.core.network.getOrNull
import com.smarttuition.app.data.model.Requirement
import com.smarttuition.app.data.model.TuitionApplication
import com.smarttuition.app.data.model.TutorOwnProfile
import com.smarttuition.app.data.repository.ApplicationRepository
import com.smarttuition.app.data.repository.AuthRepository
import com.smarttuition.app.data.repository.NotificationRepository
import com.smarttuition.app.data.repository.RequirementRepository
import com.smarttuition.app.data.repository.TutorRepository
import com.smarttuition.app.feature.parent.NotificationBell
import com.smarttuition.app.ui.components.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TutorHomeData(
    val profile: TutorOwnProfile,
    val matches: List<Requirement>,
    val matchCount: Int,
    val applications: List<TuitionApplication>,
    val unread: Int,
)

@HiltViewModel
class TutorHomeViewModel @Inject constructor(
    private val tutors: TutorRepository,
    private val requirements: RequirementRepository,
    private val applications: ApplicationRepository,
    private val notifications: NotificationRepository,
    private val auth: AuthRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<Ui<TutorHomeData>>(Ui.Loading)
    val state = _state.asStateFlow()
    val refreshing = MutableStateFlow(false)
    val message = MutableStateFlow<String?>(null)

    fun load() = viewModelScope.launch {
        if (_state.value !is Ui.Data) _state.value = Ui.Loading
        val profile = tutors.myProfile()
        if (profile !is ApiResult.Success) {
            _state.value = Ui.Error((profile as ApiResult.Failure).message)
            refreshing.value = false
            return@launch
        }
        // Keep the session copy of the verification status fresh (used to gate "Apply").
        launch { auth.refreshUser() }
        val matches = async { requirements.discover(mapOf("matchProfile" to "true", "pageSize" to "5")) }
        val apps = async { applications.list() }
        val unread = async { notifications.unreadCount() }
        val m = matches.await().getOrNull()
        _state.value = Ui.Data(
            TutorHomeData(
                profile = profile.data,
                matches = m?.items ?: emptyList(),
                matchCount = m?.total ?: 0,
                applications = apps.await().getOrNull()?.items ?: emptyList(),
                unread = unread.await().getOrNull()?.unread ?: 0,
            ),
        )
        refreshing.value = false
    }

    fun refresh() { refreshing.value = true; load() }

    fun setAvailable(available: Boolean) = viewModelScope.launch {
        when (val r = tutors.setAvailable(available)) {
            is ApiResult.Success -> {
                message.value = if (available) "You're visible to parents" else "You're hidden from search"
                load()
            }
            is ApiResult.Failure -> message.value = r.message
        }
    }

    fun submit() = viewModelScope.launch {
        when (val r = tutors.submitForVerification()) {
            is ApiResult.Success -> { message.value = "Submitted! We'll notify you once your profile is verified."; load() }
            is ApiResult.Failure -> message.value = (listOf(r.message) + r.details).joinToString("\n• ")
        }
    }
}

@Composable
fun TutorHomeScreen(
    onEditProfile: () -> Unit,
    onFindStudents: () -> Unit,
    onOpenRequirement: (String) -> Unit,
    onApplications: () -> Unit,
    onNotifications: () -> Unit,
    vm: TutorHomeViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    LifecycleResumeEffect(Unit) {
        vm.load()
        onPauseOrDispose { }
    }
    LaunchedEffect(message) { message?.let { snackbar.showSnackbar(it); vm.message.value = null } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    val name = (state as? Ui.Data)?.value?.profile?.fullName?.substringBefore(' ')
                    Text(if (name != null) "Hello, $name" else "Smart Tuition")
                },
                actions = { NotificationBell((state as? Ui.Data)?.value?.unread ?: 0, onNotifications) },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            UiContent(state, onRetry = { vm.load() }) { d ->
                val p = d.profile
                PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh) {
                    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        item { VerificationCard(p, onEditProfile, vm::submit) }
                        if (p.verificationStatus == "APPROVED") {
                            item {
                                ElevatedCard(Modifier.fillMaxWidth()) {
                                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Column(Modifier.weight(1f)) {
                                            Text(if (p.isAvailable) "Available for new students" else "Not taking new students", style = MaterialTheme.typography.titleSmall)
                                            Text(
                                                if (p.isAvailable) "Parents can find you in search" else "You're hidden from parent searches",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                        Switch(checked = p.isAvailable, onCheckedChange = vm::setAvailable)
                                    }
                                }
                            }
                        }
                        item {
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                StatCard(d.matchCount.toString(), "Matching students", Modifier.weight(1f), onClick = onFindStudents)
                                StatCard(d.applications.count { it.status == "PENDING" }.toString(), "Pending requests", Modifier.weight(1f), onClick = onApplications)
                                StatCard(d.applications.count { it.status == "ACCEPTED" }.toString(), "My students", Modifier.weight(1f), onClick = onApplications)
                            }
                        }
                        val actionNeeded = d.applications.filter { it.canRespond }
                        if (actionNeeded.isNotEmpty()) {
                            item {
                                InfoBanner(
                                    "${actionNeeded.size} parent${if (actionNeeded.size == 1) " has" else "s have"} sent you a tuition request",
                                    Tone.Warning,
                                    onClick = onApplications,
                                )
                            }
                        }
                        item { SectionTitle("Students matching your profile") { TextButton(onClick = onFindStudents) { Text("See all") } } }
                        if (d.matches.isEmpty()) {
                            item {
                                EmptyState(
                                    "No matches right now",
                                    if (p.subjects.isEmpty() || p.classes.isEmpty()) "Add the subjects and classes you teach to see matching students."
                                    else "New requirements in your area will appear here.",
                                )
                            }
                        } else {
                            items(d.matches, key = { it.id }) { r -> RequirementCardItem(r, onClick = { onOpenRequirement(r.id) }, forTutor = true) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun VerificationCard(p: TutorOwnProfile, onEditProfile: () -> Unit, onSubmit: () -> Unit) {
    val missing = p.completeness?.missing ?: emptyList()
    when (p.verificationStatus) {
        "APPROVED" -> InfoBanner("✓ Your profile is verified and visible to parents.", Tone.Success, action = {
            TextButton(onClick = onEditProfile) { Text("Edit") }
        })
        "PENDING" -> InfoBanner("Your profile is under review. Verification usually takes 1–2 working days.", Tone.Info)
        else -> ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                if (p.verificationStatus == "REJECTED") {
                    Text("Your profile needs changes", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.error)
                    p.verificationNote?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                } else {
                    Text("Complete your profile to get verified", style = MaterialTheme.typography.titleMedium)
                    Text("Only verified tutors are shown to parents and can apply for tuition.", style = MaterialTheme.typography.bodySmall)
                }
                val total = 10
                val done = (total - missing.size).coerceIn(0, total)
                Spacer(Modifier.height(10.dp))
                LinearProgressIndicator(progress = { done / total.toFloat() }, modifier = Modifier.fillMaxWidth())
                Text("$done of $total steps done", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
                if (missing.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    missing.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                }
                Spacer(Modifier.height(12.dp))
                if (missing.isEmpty()) {
                    PrimaryButton("Submit for verification", onSubmit)
                } else {
                    PrimaryButton("Complete profile", onEditProfile)
                }
            }
        }
    }
}
