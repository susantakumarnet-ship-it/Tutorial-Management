@file:OptIn(ExperimentalMaterial3Api::class)

package com.smarttuition.app.feature.parent

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.smarttuition.app.core.network.ApiResult
import com.smarttuition.app.data.model.Board
import com.smarttuition.app.data.model.IdName
import com.smarttuition.app.data.model.MetaData
import com.smarttuition.app.data.model.Student
import com.smarttuition.app.data.model.StudentRequest
import com.smarttuition.app.data.repository.MetaRepository
import com.smarttuition.app.data.repository.ParentRepository
import com.smarttuition.app.feature.auth.BackBar
import com.smarttuition.app.ui.components.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ChildrenData(val students: List<Student>, val meta: MetaData)

@HiltViewModel
class ManageChildrenViewModel @Inject constructor(
    private val parents: ParentRepository,
    private val metaRepo: MetaRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<Ui<ChildrenData>>(Ui.Loading)
    val state = _state.asStateFlow()
    val saving = MutableStateFlow(false)
    val message = MutableStateFlow<String?>(null)

    init { load() }

    fun load() = viewModelScope.launch {
        _state.value = Ui.Loading
        val meta = metaRepo.meta()
        val profile = parents.profile()
        _state.value = if (meta is ApiResult.Success && profile is ApiResult.Success) {
            Ui.Data(ChildrenData(profile.data.students, meta.data))
        } else {
            Ui.Error(((meta as? ApiResult.Failure) ?: (profile as ApiResult.Failure)).message)
        }
    }

    /** Returns true when saved so the sheet can close. */
    fun save(existingId: String?, req: StudentRequest, onDone: () -> Unit) = viewModelScope.launch {
        saving.value = true
        val result = if (existingId == null) parents.addStudent(req) else parents.updateStudent(existingId, req)
        saving.value = false
        when (result) {
            is ApiResult.Success -> {
                onDone()
                message.value = if (existingId == null) "${req.name} added" else "Changes saved"
                load()
            }
            is ApiResult.Failure -> message.value = result.message
        }
    }

    fun delete(student: Student) = viewModelScope.launch {
        when (val r = parents.deleteStudent(student.id)) {
            is ApiResult.Success -> { message.value = "${student.name} removed"; load() }
            is ApiResult.Failure -> message.value = r.message
        }
    }
}

@Composable
fun ManageChildrenScreen(onBack: () -> Unit, vm: ManageChildrenViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val saving by vm.saving.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var editing by remember { mutableStateOf<Student?>(null) }
    var adding by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf<Student?>(null) }

    LaunchedEffect(message) { message?.let { snackbar.showSnackbar(it); vm.message.value = null } }

    Scaffold(
        topBar = { BackBar("My children", onBack) },
        snackbarHost = { SnackbarHost(snackbar) },
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = { adding = true }, icon = { Icon(Icons.Filled.Add, null) }, text = { Text("Add child") })
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            UiContent(state, onRetry = { vm.load() }) { data ->
                if (data.students.isEmpty()) {
                    EmptyState("No children added", "Add each child you want to find a tutor for. You can add more than one.")
                } else {
                    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(data.students, key = { it.id }) { s ->
                            ElevatedCard(Modifier.fillMaxWidth()) {
                                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Avatar(s.name, null, 44.dp)
                                    Spacer(Modifier.width(12.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(s.name, style = MaterialTheme.typography.titleMedium)
                                        Text(listOfNotNull(s.className, s.boardCode, s.schoolName).joinToString(" • "), style = MaterialTheme.typography.bodySmall)
                                    }
                                    IconButton(onClick = { editing = s }) { Icon(Icons.Outlined.Edit, "Edit ${s.name}") }
                                    IconButton(onClick = { confirmDelete = s }) { Icon(Icons.Outlined.Delete, "Remove ${s.name}") }
                                }
                            }
                        }
                    }
                }

                if (adding || editing != null) {
                    ChildSheet(
                        initial = editing,
                        classes = data.meta.classes,
                        boards = data.meta.boards,
                        saving = saving,
                        onDismiss = { adding = false; editing = null },
                        onSave = { req -> vm.save(editing?.id, req) { adding = false; editing = null } },
                    )
                }
            }
        }
    }

    confirmDelete?.let { s ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text("Remove ${s.name}?") },
            text = { Text("Any open tuition requirements for ${s.name} will be closed.") },
            confirmButton = { TextButton(onClick = { vm.delete(s); confirmDelete = null }) { Text("Remove") } },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun ChildSheet(
    initial: Student?,
    classes: List<IdName>,
    boards: List<Board>,
    saving: Boolean,
    onDismiss: () -> Unit,
    onSave: (StudentRequest) -> Unit,
) {
    var name by remember { mutableStateOf(initial?.name ?: "") }
    var classItem by remember { mutableStateOf(classes.find { it.id == initial?.classId }) }
    var board by remember { mutableStateOf(boards.find { it.id == initial?.boardId }) }
    var school by remember { mutableStateOf(initial?.schoolName ?: "") }
    var gender by remember { mutableStateOf(initial?.gender) }
    var nameError by remember { mutableStateOf<String?>(null) }
    var classError by remember { mutableStateOf<String?>(null) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 32.dp)) {
            Text(if (initial == null) "Add child" else "Edit ${initial.name}", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(16.dp))
            FormField(name, { name = it; nameError = null }, "Child's name", error = nameError)
            Spacer(Modifier.height(8.dp))
            DropdownField("Class", classes, classItem, { it.name }, { classItem = it; classError = null }, error = classError)
            Spacer(Modifier.height(8.dp))
            DropdownField("Board", boards, board, { "${it.code} — ${it.name}" }, { board = it })
            Spacer(Modifier.height(8.dp))
            FormField(school, { school = it }, "School name (optional)")
            Spacer(Modifier.height(12.dp))
            Text("Gender (optional)", style = MaterialTheme.typography.labelLarge)
            SingleSelectChips(listOf("MALE", "FEMALE", "OTHER"), gender, { it.lowercase().replaceFirstChar(Char::uppercase) }) {
                gender = if (gender == it) null else it
            }
            Spacer(Modifier.height(20.dp))
            PrimaryButton("Save", loading = saving, onClick = {
                nameError = if (name.trim().length < 2) "Enter the child's name" else null
                classError = if (classItem == null) "Select a class" else null
                if (nameError == null && classError == null) {
                    onSave(StudentRequest(name.trim(), classItem!!.id, board?.id, school.trim().ifBlank { null }, gender))
                }
            })
        }
    }
}
