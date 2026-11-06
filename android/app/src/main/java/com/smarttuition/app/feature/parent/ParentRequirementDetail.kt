@file:OptIn(ExperimentalMaterial3Api::class)

package com.smarttuition.app.feature.parent

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import com.smarttuition.app.core.network.ApiResult
import com.smarttuition.app.core.util.modeLabel
import com.smarttuition.app.core.util.rupees
import com.smarttuition.app.core.util.statusLabel
import com.smarttuition.app.data.model.Requirement
import com.smarttuition.app.data.model.TuitionApplication
import com.smarttuition.app.data.repository.ApplicationRepository
import com.smarttuition.app.data.repository.RequirementRepository
import com.smarttuition.app.feature.auth.BackBar
import com.smarttuition.app.ui.components.*
import com.smarttuition.app.ui.navigation.ParentRequirementDetailRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class RequirementWithApps(val requirement: Requirement, val applications: List<TuitionApplication>)

@HiltViewModel
class ParentRequirementDetailViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val requirements: RequirementRepository,
    private val applications: ApplicationRepository,
) : ViewModel() {
    val id = savedState.toRoute<ParentRequirementDetailRoute>().id
    private val _state = MutableStateFlow<Ui<RequirementWithApps>>(Ui.Loading)
    val state = _state.asStateFlow()
    val message = MutableStateFlow<String?>(null)

    fun load() = viewModelScope.launch {
        if (_state.value !is Ui.Data) _state.value = Ui.Loading
        val req = async { requirements.get(id) }
        val apps = async { applications.list(requirementId = id) }
        val r = req.await()
        val a = apps.await()
        _state.value = if (r is ApiResult.Success && a is ApiResult.Success) {
            Ui.Data(RequirementWithApps(r.data, a.data.items))
        } else {
            Ui.Error(((r as? ApiResult.Failure) ?: (a as ApiResult.Failure)).message)
        }
    }

    fun close() = viewModelScope.launch {
        when (val r = requirements.close(id)) {
            is ApiResult.Success -> { message.value = "Requirement closed"; load() }
            is ApiResult.Failure -> message.value = r.message
        }
    }
}

@Composable
fun ParentRequirementDetailScreen(
    onBack: () -> Unit,
    onEdit: (String) -> Unit,
    onOpenApplication: (String) -> Unit,
    vm: ParentRequirementDetailViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var confirmClose by remember { mutableStateOf(false) }

    LifecycleResumeEffect(Unit) {
        vm.load()
        onPauseOrDispose { }
    }
    LaunchedEffect(message) { message?.let { snackbar.showSnackbar(it); vm.message.value = null } }

    val isOpen = (state as? Ui.Data)?.value?.requirement?.status == "OPEN"
    Scaffold(
        topBar = {
            BackBar("Requirement", onBack) {
                if (isOpen) IconButton(onClick = { onEdit(vm.id) }) { Icon(Icons.Outlined.Edit, "Edit") }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            UiContent(state, onRetry = { vm.load() }) { data ->
                val r = data.requirement
                LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    item {
                        ElevatedCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp)) {
                                Row {
                                    Text("${r.studentName ?: "Student"} • ${r.className}", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                                    StatusPill(statusLabel(r.status), toneFor(r.status))
                                }
                                Text(r.subjects.joinToString { it.name }, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Spacer(Modifier.height(12.dp))
                                Row {
                                    LabeledValue("Budget", "${rupees(r.monthlyBudget)}/month", Modifier.weight(1f))
                                    LabeledValue("Mode", modeLabel(r.mode), Modifier.weight(1f))
                                }
                                Spacer(Modifier.height(8.dp))
                                Row {
                                    LabeledValue("Schedule", "${r.daysPerWeek} days/week • ${r.preferredTime}", Modifier.weight(1f))
                                    LabeledValue("Tutor gender", when (r.preferredTutorGender) { "ANY" -> "No preference"; else -> statusLabel(r.preferredTutorGender) }, Modifier.weight(1f))
                                }
                                Spacer(Modifier.height(8.dp))
                                LabeledValue("Location", listOfNotNull(r.locality, r.city, r.pincode).joinToString(", "))
                                r.additionalNotes?.let { Spacer(Modifier.height(8.dp)); LabeledValue("Notes", it) }
                            }
                        }
                    }
                    item { SectionTitle("Tutor applications (${data.applications.size})") }
                    if (data.applications.isEmpty()) {
                        item {
                            EmptyState(
                                "No applications yet",
                                if (r.status == "OPEN") "Verified tutors near you will see this requirement. You'll get a notification when someone applies."
                                else "This requirement is no longer open.",
                            )
                        }
                    } else {
                        items(data.applications, key = { it.id }) { app ->
                            ApplicationCardItem(app, viewerIsParent = true) { onOpenApplication(app.id) }
                        }
                    }
                    if (r.status == "OPEN") {
                        item {
                            Spacer(Modifier.height(16.dp))
                            OutlinedButton(onClick = { confirmClose = true }, modifier = Modifier.fillMaxWidth()) { Text("Close this requirement") }
                        }
                    }
                }
            }
        }
    }

    if (confirmClose) {
        AlertDialog(
            onDismissRequest = { confirmClose = false },
            title = { Text("Close requirement?") },
            text = { Text("Tutors will no longer see it or be able to apply. Existing conversations are not affected.") },
            confirmButton = { TextButton(onClick = { confirmClose = false; vm.close() }) { Text("Close requirement") } },
            dismissButton = { TextButton(onClick = { confirmClose = false }) { Text("Cancel") } },
        )
    }
}
