@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.smarttuition.app.feature.parent

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.outlined.PersonSearch
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.smarttuition.app.core.location.LocationProvider
import com.smarttuition.app.core.network.ApiResult
import com.smarttuition.app.core.util.DAY_NAMES
import com.smarttuition.app.data.model.Board
import com.smarttuition.app.data.model.IdName
import com.smarttuition.app.data.model.MetaData
import com.smarttuition.app.data.model.TutorCard
import com.smarttuition.app.data.repository.MetaRepository
import com.smarttuition.app.data.repository.ParentRepository
import com.smarttuition.app.data.repository.TutorRepository
import com.smarttuition.app.ui.components.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TutorFilters(
    val query: String = "",
    val classItem: IdName? = null,
    val subject: IdName? = null,
    val board: Board? = null,
    val mode: String? = null,          // ONLINE | OFFLINE
    val gender: String? = null,        // MALE | FEMALE
    val maxFee: String = "",
    val minExperience: Int? = null,
    val dayOfWeek: Int? = null,
    val city: String = "",
    val pincode: String = "",
    val lat: Double? = null,
    val lng: Double? = null,
    val radiusKm: Int = 10,
    val sort: String = "relevance",
) {
    val activeCount: Int
        get() = listOf(classItem, subject, board, mode, gender, minExperience, dayOfWeek).count { it != null } +
            listOf(maxFee, city, pincode).count { it.isNotBlank() }

    fun toQuery(page: Int): Map<String, String> = buildMap {
        put("page", page.toString())
        put("pageSize", "20")
        put("sort", sort)
        if (query.isNotBlank()) put("q", query.trim())
        classItem?.let { put("classId", it.id.toString()) }
        subject?.let { put("subjectId", it.id.toString()) }
        board?.let { put("boardId", it.id.toString()) }
        mode?.let { put("mode", it) }
        gender?.let { put("gender", it) }
        maxFee.toIntOrNull()?.let { put("maxFee", it.toString()) }
        minExperience?.let { put("minExperience", it.toString()) }
        dayOfWeek?.let { put("dayOfWeek", it.toString()) }
        if (lat != null && lng != null) {
            put("lat", lat.toString()); put("lng", lng.toString()); put("radiusKm", radiusKm.toString())
        } else {
            if (city.isNotBlank()) put("city", city.trim())
            if (pincode.length == 6) put("pincode", pincode)
        }
    }
}

data class SearchState(
    val filters: TutorFilters = TutorFilters(),
    val results: List<TutorCard> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val totalPages: Int = 1,
    val loading: Boolean = false,
    val loadingMore: Boolean = false,
    val error: String? = null,
    val meta: MetaData? = null,
    val locating: Boolean = false,
)

@HiltViewModel
class SearchTutorsViewModel @Inject constructor(
    private val tutors: TutorRepository,
    private val metaRepo: MetaRepository,
    private val parents: ParentRepository,
    private val location: LocationProvider,
) : ViewModel() {
    private val _state = MutableStateFlow(SearchState())
    val state = _state.asStateFlow()
    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            val meta = (metaRepo.meta() as? ApiResult.Success)?.data
            // Default the search area to the parent's saved home location / city.
            val profile = (parents.profile() as? ApiResult.Success)?.data
            _state.update {
                it.copy(
                    meta = meta,
                    filters = it.filters.copy(lat = profile?.latitude, lng = profile?.longitude, city = profile?.city ?: ""),
                )
            }
            search()
        }
    }

    fun updateFilters(transform: (TutorFilters) -> TutorFilters, debounce: Boolean = false) {
        _state.update { it.copy(filters = transform(it.filters)) }
        search(debounce)
    }

    fun search(debounce: Boolean = false) {
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            if (debounce) delay(400)
            _state.update { it.copy(loading = true, error = null) }
            when (val r = tutors.search(_state.value.filters.toQuery(1))) {
                is ApiResult.Success -> _state.update {
                    it.copy(loading = false, results = r.data.items, total = r.data.total, page = 1, totalPages = r.data.totalPages)
                }
                is ApiResult.Failure -> _state.update { it.copy(loading = false, error = r.message) }
            }
        }
    }

    fun loadMore() {
        val s = _state.value
        if (s.loading || s.loadingMore || s.page >= s.totalPages) return
        viewModelScope.launch {
            _state.update { it.copy(loadingMore = true) }
            when (val r = tutors.search(s.filters.toQuery(s.page + 1))) {
                is ApiResult.Success -> _state.update {
                    it.copy(loadingMore = false, results = it.results + r.data.items, page = s.page + 1, totalPages = r.data.totalPages)
                }
                is ApiResult.Failure -> _state.update { it.copy(loadingMore = false) }
            }
        }
    }

    fun useMyLocation() = viewModelScope.launch {
        _state.update { it.copy(locating = true) }
        val here = location.current()
        _state.update { it.copy(locating = false, error = if (here == null) "Couldn't get your location" else null) }
        if (here != null) updateFilters({ it.copy(lat = here.latitude, lng = here.longitude, sort = "distance") })
    }
}

@Composable
fun SearchTutorsScreen(onOpenTutor: (String) -> Unit, vm: SearchTutorsViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    var showFilters by remember { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted.values.any { it }) vm.useMyLocation()
    }

    Scaffold(topBar = { TopAppBar(title = { Text("Find tutors") }) }) { padding ->
        Column(Modifier.padding(padding)) {
            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = s.filters.query,
                    onValueChange = { q -> vm.updateFilters({ it.copy(query = q) }, debounce = true) },
                    placeholder = { Text("Tutor name or keyword") },
                    leadingIcon = { Icon(Icons.Filled.Search, null) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                BadgedBox(badge = { if (s.filters.activeCount > 0) Badge { Text(s.filters.activeCount.toString()) } }) {
                    FilledTonalIconButton(onClick = { showFilters = true }) { Icon(Icons.Filled.Tune, "Filters") }
                }
            }
            // Quick filters
            FlowRow(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = s.filters.lat != null,
                    onClick = {
                        if (s.filters.lat != null) vm.updateFilters({ it.copy(lat = null, lng = null) })
                        else permission.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
                    },
                    leadingIcon = { Icon(Icons.Filled.MyLocation, null, Modifier.size(16.dp)) },
                    label = { Text(if (s.locating) "Locating…" else if (s.filters.lat != null) "Within ${s.filters.radiusKm} km" else "Near me") },
                )
                FilterChip(selected = s.filters.mode == "ONLINE", onClick = {
                    vm.updateFilters({ it.copy(mode = if (it.mode == "ONLINE") null else "ONLINE") })
                }, label = { Text("Online") })
                FilterChip(selected = s.filters.mode == "OFFLINE", onClick = {
                    vm.updateFilters({ it.copy(mode = if (it.mode == "OFFLINE") null else "OFFLINE") })
                }, label = { Text("Home tuition") })
            }

            when {
                s.loading && s.results.isEmpty() -> LoadingBox()
                s.error != null && s.results.isEmpty() -> ErrorBox(s.error!!, onRetry = { vm.search() })
                s.results.isEmpty() -> EmptyState(
                    "No tutors match",
                    "Try widening the distance, removing a filter, or switching to online tuition.",
                    icon = Icons.Outlined.PersonSearch,
                )
                else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    item {
                        Text("${s.total} tutor${if (s.total == 1) "" else "s"} found", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    items(s.results, key = { it.id }) { tutor -> TutorCardItem(tutor) { onOpenTutor(tutor.id) } }
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
        FilterSheet(s.filters, s.meta!!, onDismiss = { showFilters = false }, onApply = { f ->
            showFilters = false
            vm.updateFilters({ f })
        })
    }
}

@Composable
private fun FilterSheet(initial: TutorFilters, meta: MetaData, onDismiss: () -> Unit, onApply: (TutorFilters) -> Unit) {
    var f by remember { mutableStateOf(initial) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 32.dp)) {
            Text("Filters", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(12.dp))
            DropdownField("Class", listOf<IdName?>(null) + meta.classes, f.classItem, { it?.name ?: "Any class" }, { f = f.copy(classItem = it) })
            Spacer(Modifier.height(8.dp))
            DropdownField("Subject", listOf<IdName?>(null) + meta.subjects, f.subject, { it?.name ?: "Any subject" }, { f = f.copy(subject = it) })
            Spacer(Modifier.height(8.dp))
            DropdownField("Board", listOf<Board?>(null) + meta.boards, f.board, { it?.code ?: "Any board" }, { f = f.copy(board = it) })

            SectionTitle("Tuition mode")
            SingleSelectChips(listOf<String?>(null, "OFFLINE", "ONLINE"), f.mode, { mapOf(null to "Any", "OFFLINE" to "Home tuition", "ONLINE" to "Online")[it]!! }) { f = f.copy(mode = it) }

            SectionTitle("Tutor gender")
            SingleSelectChips(listOf<String?>(null, "FEMALE", "MALE"), f.gender, { mapOf(null to "Any", "FEMALE" to "Female", "MALE" to "Male")[it]!! }) { f = f.copy(gender = it) }

            SectionTitle("Fees & experience")
            FormField(f.maxFee, { v -> f = f.copy(maxFee = v.filter(Char::isDigit).take(6)) }, "Maximum monthly fee", keyboardType = KeyboardType.Number, prefix = "₹ ")
            Spacer(Modifier.height(8.dp))
            SingleSelectChips(listOf<Int?>(null, 1, 3, 5, 10), f.minExperience, { if (it == null) "Any experience" else "$it+ yrs" }) { f = f.copy(minExperience = it) }

            SectionTitle("Available on")
            SingleSelectChips(listOf<Int?>(null) + (0..6).toList(), f.dayOfWeek, { if (it == null) "Any day" else DAY_NAMES[it] }) { f = f.copy(dayOfWeek = it) }

            SectionTitle("Location")
            if (f.lat != null) {
                Text("Distance: within ${f.radiusKm} km", style = MaterialTheme.typography.bodyMedium)
                Slider(value = f.radiusKm.toFloat(), onValueChange = { f = f.copy(radiusKm = it.toInt()) }, valueRange = 1f..50f)
                TextButton(onClick = { f = f.copy(lat = null, lng = null) }) { Text("Search by city / pincode instead") }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FormField(f.city, { f = f.copy(city = it) }, "City", Modifier.weight(1f))
                    FormField(f.pincode, { v -> f = f.copy(pincode = v.filter(Char::isDigit).take(6)) }, "Pincode", Modifier.weight(1f), keyboardType = KeyboardType.Number)
                }
            }

            SectionTitle("Sort by")
            SingleSelectChips(
                listOf("relevance", "distance", "rating", "fee_low", "fee_high", "experience"),
                f.sort,
                { mapOf("relevance" to "Best match", "distance" to "Nearest", "rating" to "Top rated", "fee_low" to "Fee: low to high", "fee_high" to "Fee: high to low", "experience" to "Most experienced")[it]!! },
            ) { f = f.copy(sort = it) }

            Spacer(Modifier.height(20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(
                    onClick = { f = TutorFilters(query = f.query, lat = f.lat, lng = f.lng) },
                    modifier = Modifier.weight(1f).heightIn(min = 52.dp),
                ) { Text("Clear") }
                Button(onClick = { onApply(f) }, modifier = Modifier.weight(1f).heightIn(min = 52.dp)) { Text("Show tutors") }
            }
        }
    }
}
