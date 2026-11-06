@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.smarttuition.app.feature.tutor

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.outlined.TravelExplore
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.smarttuition.app.core.network.ApiResult
import com.smarttuition.app.data.model.Board
import com.smarttuition.app.data.model.IdName
import com.smarttuition.app.data.model.MetaData
import com.smarttuition.app.data.model.Requirement
import com.smarttuition.app.data.repository.MetaRepository
import com.smarttuition.app.data.repository.RequirementRepository
import com.smarttuition.app.ui.components.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class StudentFilters(
    val matchProfile: Boolean = true,
    val savedOnly: Boolean = false,
    val classItem: IdName? = null,
    val subject: IdName? = null,
    val board: Board? = null,
    val mode: String? = null,        // ONLINE | HOME
    val minBudget: String = "",
    val radiusKm: Int? = null,       // null = my service radius
    val city: String = "",
    val pincode: String = "",
    val sort: String = "newest",
) {
    fun toQuery(page: Int): Map<String, String> = buildMap {
        put("page", page.toString())
        put("pageSize", "20")
        put("sort", sort)
        if (matchProfile) put("matchProfile", "true")
        if (savedOnly) put("savedOnly", "true")
        classItem?.let { put("classId", it.id.toString()) }
        subject?.let { put("subjectId", it.id.toString()) }
        board?.let { put("boardId", it.id.toString()) }
        mode?.let { put("mode", it) }
        minBudget.toIntOrNull()?.let { put("minBudget", it.toString()) }
        radiusKm?.let { put("radiusKm", it.toString()) }
        if (city.isNotBlank()) put("city", city.trim())
        if (pincode.length == 6) put("pincode", pincode)
    }
}

data class FindStudentsState(
    val filters: StudentFilters = StudentFilters(),
    val items: List<Requirement> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val totalPages: Int = 1,
    val loading: Boolean = true,
    val error: String? = null,
    val meta: MetaData? = null,
)

@HiltViewModel
class FindStudentsViewModel @Inject constructor(
    private val requirements: RequirementRepository,
    private val metaRepo: MetaRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(FindStudentsState())
    val state = _state.asStateFlow()
    val message = MutableStateFlow<String?>(null)
    private var job: Job? = null

    init {
        viewModelScope.launch { _state.update { it.copy(meta = (metaRepo.meta() as? ApiResult.Success)?.data) } }
    }

    fun setFilters(f: StudentFilters) {
        _state.update { it.copy(filters = f) }
        search()
    }

    fun search() {
        job?.cancel()
        job = viewModelScope.launch {
            _state.update { it.copy(loading = it.items.isEmpty(), error = null) }
            when (val r = requirements.discover(_state.value.filters.toQuery(1))) {
                is ApiResult.Success -> _state.update { it.copy(loading = false, items = r.data.items, total = r.data.total, page = 1, totalPages = r.data.totalPages) }
                is ApiResult.Failure -> _state.update { it.copy(loading = false, error = r.message) }
            }
        }
    }

    fun loadMore() {
        val s = _state.value
        if (s.page >= s.totalPages) return
        viewModelScope.launch {
            (requirements.discover(s.filters.toQuery(s.page + 1)) as? ApiResult.Success)?.let { r ->
                _state.update { it.copy(items = it.items + r.data.items, page = s.page + 1, totalPages = r.data.totalPages) }
            }
        }
    }

    fun toggleSave(req: Requirement) = viewModelScope.launch {
        when (val r = requirements.setSaved(req.id, !req.isSaved)) {
            is ApiResult.Success -> _state.update { s ->
                val updated = s.items.map { if (it.id == req.id) it.copy(isSaved = r.data.isSaved) else it }
                s.copy(items = if (s.filters.savedOnly) updated.filter { it.isSaved } else updated)
            }
            is ApiResult.Failure -> message.value = r.message
        }
    }
}

@Composable
fun FindStudentsScreen(onOpenRequirement: (String) -> Unit, vm: FindStudentsViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var showFilters by remember { mutableStateOf(false) }
    LifecycleResumeEffect(Unit) {
        vm.search()
        onPauseOrDispose { }
    }
    LaunchedEffect(message) { message?.let { snackbar.showSnackbar(it); vm.message.value = null } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Find students") },
                actions = { IconButton(onClick = { showFilters = true }) { Icon(Icons.Filled.Tune, "Filters") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = s.filters.matchProfile, onClick = { vm.setFilters(s.filters.copy(matchProfile = !s.filters.matchProfile)) }, label = { Text("Matches my profile") })
                FilterChip(selected = s.filters.savedOnly, onClick = { vm.setFilters(s.filters.copy(savedOnly = !s.filters.savedOnly)) }, label = { Text("Saved") })
                FilterChip(selected = s.filters.mode == "HOME", onClick = { vm.setFilters(s.filters.copy(mode = if (s.filters.mode == "HOME") null else "HOME")) }, label = { Text("Home") })
                FilterChip(selected = s.filters.mode == "ONLINE", onClick = { vm.setFilters(s.filters.copy(mode = if (s.filters.mode == "ONLINE") null else "ONLINE")) }, label = { Text("Online") })
            }
            when {
                s.loading -> LoadingBox()
                s.error != null && s.items.isEmpty() -> ErrorBox(s.error!!, onRetry = vm::search)
                s.items.isEmpty() -> EmptyState(
                    "No students found",
                    "Try turning off \"Matches my profile\", increasing the distance, or searching another city.",
                    icon = Icons.Outlined.TravelExplore,
                )
                else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    item { Text("${s.total} requirement${if (s.total == 1) "" else "s"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    items(s.items, key = { it.id }) { r ->
                        RequirementCardItem(r, onClick = { onOpenRequirement(r.id) }, forTutor = true, onToggleSave = { vm.toggleSave(r) })
                    }
                    if (s.page < s.totalPages) {
                        item {
                            LaunchedEffect(s.page) { vm.loadMore() }
                            Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                        }
                    }
                }
            }
        }
    }

    if (showFilters && s.meta != null) {
        StudentFilterSheet(s.filters, s.meta!!, onDismiss = { showFilters = false }) { f ->
            showFilters = false
            vm.setFilters(f)
        }
    }
}

@Composable
private fun StudentFilterSheet(initial: StudentFilters, meta: MetaData, onDismiss: () -> Unit, onApply: (StudentFilters) -> Unit) {
    var f by remember { mutableStateOf(initial) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 32.dp)) {
            Text("Filter requirements", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(12.dp))
            DropdownField("Class", listOf<IdName?>(null) + meta.classes, f.classItem, { it?.name ?: "Any class" }, { f = f.copy(classItem = it) })
            Spacer(Modifier.height(8.dp))
            DropdownField("Subject", listOf<IdName?>(null) + meta.subjects, f.subject, { it?.name ?: "Any subject" }, { f = f.copy(subject = it) })
            Spacer(Modifier.height(8.dp))
            DropdownField("Board", listOf<Board?>(null) + meta.boards, f.board, { it?.code ?: "Any board" }, { f = f.copy(board = it) })
            Spacer(Modifier.height(8.dp))
            FormField(f.minBudget, { v -> f = f.copy(minBudget = v.filter(Char::isDigit).take(6)) }, "Minimum monthly budget", keyboardType = KeyboardType.Number, prefix = "₹ ")

            SectionTitle("Distance")
            val radius = f.radiusKm
            Text(if (radius == null) "Within my service radius" else "Within $radius km", style = MaterialTheme.typography.bodyMedium)
            Slider(value = (radius ?: 0).toFloat(), onValueChange = { f = f.copy(radiusKm = if (it < 1f) null else it.toInt()) }, valueRange = 0f..50f)

            SectionTitle("Or search another area")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FormField(f.city, { f = f.copy(city = it) }, "City", Modifier.weight(1f))
                FormField(f.pincode, { v -> f = f.copy(pincode = v.filter(Char::isDigit).take(6)) }, "Pincode", Modifier.weight(1f), keyboardType = KeyboardType.Number)
            }

            SectionTitle("Sort by")
            SingleSelectChips(listOf("newest", "distance", "budget_high"), f.sort, { mapOf("newest" to "Newest", "distance" to "Nearest", "budget_high" to "Highest budget")[it]!! }) { f = f.copy(sort = it) }

            Spacer(Modifier.height(20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = { f = StudentFilters() }, modifier = Modifier.weight(1f).heightIn(min = 52.dp)) { Text("Reset") }
                Button(onClick = { onApply(f) }, modifier = Modifier.weight(1f).heightIn(min = 52.dp)) { Text("Apply") }
            }
        }
    }
}
