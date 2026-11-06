@file:OptIn(ExperimentalMaterial3Api::class)

package com.smarttuition.app.feature.tutor

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import com.smarttuition.app.core.network.ApiResult
import com.smarttuition.app.core.session.SessionManager
import com.smarttuition.app.core.util.modeLabel
import com.smarttuition.app.core.util.rupees
import com.smarttuition.app.core.util.statusLabel
import com.smarttuition.app.core.util.timeAgo
import com.smarttuition.app.data.model.Requirement
import com.smarttuition.app.data.repository.ApplicationRepository
import com.smarttuition.app.data.repository.RequirementRepository
import com.smarttuition.app.feature.auth.BackBar
import com.smarttuition.app.ui.components.*
import com.smarttuition.app.ui.navigation.TutorRequirementDetailRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class TutorRequirementDetailViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val requirements: RequirementRepository,
    private val applications: ApplicationRepository,
    session: SessionManager,
) : ViewModel() {
    private val id = savedState.toRoute<TutorRequirementDetailRoute>().id
    val verified = session.user?.tutorVerificationStatus == "APPROVED"
    private val _state = MutableStateFlow<Ui<Requirement>>(Ui.Loading)
    val state = _state.asStateFlow()
    val applying = MutableStateFlow(false)
    val message = MutableStateFlow<String?>(null)

    init { load() }

    fun load() = viewModelScope.launch { _state.value = requirements.get(id).toUi() }

    fun toggleSave() = viewModelScope.launch {
        val r = (_state.value as? Ui.Data)?.value ?: return@launch
        when (val res = requirements.setSaved(r.id, !r.isSaved)) {
            is ApiResult.Success -> _state.value = Ui.Data(r.copy(isSaved = res.data.isSaved))
            is ApiResult.Failure -> message.value = res.message
        }
    }

    fun apply(note: String, fee: Int?, onDone: () -> Unit) = viewModelScope.launch {
        applying.value = true
        val res = applications.apply(id, note.trim().ifBlank { null }, fee)
        applying.value = false
        when (res) {
            is ApiResult.Success -> {
                onDone()
                message.value = "Application sent! The parent has been notified."
                load()
            }
            is ApiResult.Failure -> message.value = res.message
        }
    }
}

@Composable
fun TutorRequirementDetailScreen(
    onBack: () -> Unit,
    onOpenApplication: (String) -> Unit,
    onCompleteProfile: () -> Unit,
    vm: TutorRequirementDetailViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val applying by vm.applying.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var showApply by remember { mutableStateOf(false) }
    LaunchedEffect(message) { message?.let { snackbar.showSnackbar(it); vm.message.value = null } }

    val req = (state as? Ui.Data)?.value
    Scaffold(
        topBar = {
            BackBar("Student requirement", onBack) {
                if (req != null) {
                    IconButton(onClick = vm::toggleSave) {
                        Icon(if (req.isSaved) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder, if (req.isSaved) "Remove from saved" else "Save")
                    }
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            if (req != null) Surface(tonalElevation = 3.dp) {
                Box(Modifier.navigationBarsPadding().padding(16.dp)) {
                    when {
                        req.applicationId != null -> OutlinedButton(
                            onClick = { onOpenApplication(req.applicationId) },
                            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                        ) { Text("Applied • ${statusLabel(req.applicationStatus ?: "PENDING")} — view") }
                        !vm.verified -> PrimaryButton("Get verified to apply", onCompleteProfile)
                        req.status != "OPEN" -> PrimaryButton("No longer accepting applications", {}, enabled = false)
                        else -> PrimaryButton("Apply for tuition", { showApply = true })
                    }
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            UiContent(state, onRetry = { vm.load() }) { r ->
                Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                    Text("${r.className}${r.boardCode?.let { " • $it" } ?: ""}", style = MaterialTheme.typography.headlineSmall)
                    Text(r.subjects.joinToString { it.name }, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                    Text("Posted ${timeAgo(r.createdAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(16.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        StatCard(rupees(r.monthlyBudget), "monthly budget", Modifier.weight(1f))
                        StatCard("${r.daysPerWeek}", "days per week", Modifier.weight(1f))
                    }
                    Spacer(Modifier.height(16.dp))
                    Row {
                        LabeledValue("Preferred timing", r.preferredTime, Modifier.weight(1f))
                        LabeledValue("Mode", modeLabel(r.mode), Modifier.weight(1f))
                    }
                    Spacer(Modifier.height(12.dp))
                    Row {
                        LabeledValue("Area", listOfNotNull(r.locality, r.city, r.pincode).joinToString(", "), Modifier.weight(1f))
                        LabeledValue("Distance", r.distanceKm?.let { "~%.1f km".format(it) } ?: "—", Modifier.weight(1f))
                    }
                    Spacer(Modifier.height(12.dp))
                    Row {
                        LabeledValue("Tutor preference", if (r.preferredTutorGender == "ANY") "No preference" else statusLabel(r.preferredTutorGender), Modifier.weight(1f))
                        LabeledValue("Student", r.studentGender?.let { statusLabel(it) } ?: "—", Modifier.weight(1f))
                    }
                    r.additionalNotes?.let {
                        SectionTitle("Parent's notes")
                        Text(it, style = MaterialTheme.typography.bodyMedium)
                    }
                    Spacer(Modifier.height(20.dp))
                    Row(verticalAlignment = Alignment.Top) {
                        Icon(Icons.Outlined.Shield, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "To protect families, the student's name, the parent's contact details and the exact address are shared only after the parent accepts your application.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }

    if (showApply && req != null) {
        ApplySheet(req, applying, onDismiss = { showApply = false }) { note, fee -> vm.apply(note, fee) { showApply = false } }
    }
}

@Composable
private fun ApplySheet(req: Requirement, applying: Boolean, onDismiss: () -> Unit, onApply: (String, Int?) -> Unit) {
    var note by remember { mutableStateOf("") }
    var fee by remember { mutableStateOf(req.monthlyBudget.toString()) }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 32.dp)) {
            Text("Apply for this tuition", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(4.dp))
            Text("The parent will see your profile and this message.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(16.dp))
            FormField(note, { note = it.take(1000) }, "Message to parent", singleLine = false, minLines = 4,
                supporting = "Introduce yourself, your approach and when you can start")
            Spacer(Modifier.height(8.dp))
            FormField(fee, { fee = it.filter(Char::isDigit).take(6) }, "Your monthly fee", keyboardType = KeyboardType.Number, prefix = "₹ ",
                supporting = "Parent's budget: ${rupees(req.monthlyBudget)}")
            Spacer(Modifier.height(16.dp))
            PrimaryButton("Send application", { onApply(note, fee.toIntOrNull()?.takeIf { it >= 100 }) }, loading = applying)
        }
    }
}
