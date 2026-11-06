@file:OptIn(ExperimentalMaterial3Api::class)

package com.smarttuition.app.feature.parent

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import com.smarttuition.app.core.location.LocationProvider
import com.smarttuition.app.core.network.ApiResult
import com.smarttuition.app.core.util.Validators
import com.smarttuition.app.data.model.IdName
import com.smarttuition.app.data.model.Location
import com.smarttuition.app.data.model.MetaData
import com.smarttuition.app.data.model.RequirementRequest
import com.smarttuition.app.data.model.Student
import com.smarttuition.app.data.repository.MetaRepository
import com.smarttuition.app.data.repository.ParentRepository
import com.smarttuition.app.data.repository.RequirementRepository
import com.smarttuition.app.feature.auth.BackBar
import com.smarttuition.app.ui.components.*
import com.smarttuition.app.ui.navigation.PostRequirementRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class RequirementForm(
    val student: Student? = null,
    val subjects: Set<IdName> = emptySet(),
    val daysPerWeek: Int = 5,
    val preferredTime: String = "",
    val tutorGender: String = "ANY",
    val budget: String = "",
    val mode: String = "HOME",
    val location: Location? = null,
    val city: String = "",
    val pincode: String = "",
    val locality: String = "",
    val latitude: Double? = null,
    val longitude: Double? = null,
    val notes: String = "",
    val errors: Map<String, String> = emptyMap(),
)

data class PostRequirementData(val meta: MetaData, val students: List<Student>)

@HiltViewModel
class PostRequirementViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val metaRepo: MetaRepository,
    private val parents: ParentRepository,
    private val requirements: RequirementRepository,
    private val locationProvider: LocationProvider,
) : ViewModel() {
    val editingId: String? = savedState.toRoute<PostRequirementRoute>().requirementId

    private val _data = MutableStateFlow<Ui<PostRequirementData>>(Ui.Loading)
    val data = _data.asStateFlow()
    private val _form = MutableStateFlow(RequirementForm())
    val form = _form.asStateFlow()
    val saving = MutableStateFlow(false)
    val error = MutableStateFlow<String?>(null)
    val locating = MutableStateFlow(false)
    val savedId = MutableStateFlow<String?>(null)
    val locationResults = MutableStateFlow<List<Location>>(emptyList())

    init { load() }

    fun load() = viewModelScope.launch {
        _data.value = Ui.Loading
        val meta = metaRepo.meta()
        val profile = parents.profile()
        if (meta !is ApiResult.Success || profile !is ApiResult.Success) {
            _data.value = Ui.Error(((meta as? ApiResult.Failure) ?: (profile as ApiResult.Failure)).message)
            return@launch
        }
        val students = profile.data.students
        // Pre-fill: from the existing requirement when editing, otherwise from the parent's saved address.
        if (editingId != null) {
            when (val r = requirements.get(editingId)) {
                is ApiResult.Success -> {
                    val req = r.data
                    _form.value = RequirementForm(
                        student = students.find { it.id == req.studentId },
                        subjects = meta.data.subjects.filter { s -> req.subjects.any { it.id == s.id } }.toSet(),
                        daysPerWeek = req.daysPerWeek,
                        preferredTime = req.preferredTime,
                        tutorGender = req.preferredTutorGender,
                        budget = req.monthlyBudget.toString(),
                        mode = req.mode,
                        city = req.city,
                        pincode = req.pincode,
                        locality = req.locality ?: "",
                        latitude = req.latitude,
                        longitude = req.longitude,
                        notes = req.additionalNotes ?: "",
                    )
                }
                is ApiResult.Failure -> { _data.value = Ui.Error(r.message); return@launch }
            }
        } else {
            val p = profile.data
            _form.update {
                it.copy(
                    student = students.singleOrNull(),
                    city = p.city ?: "",
                    pincode = p.pincode ?: "",
                    latitude = p.latitude,
                    longitude = p.longitude,
                )
            }
        }
        _data.value = Ui.Data(PostRequirementData(meta.data, students))
    }

    fun edit(transform: (RequirementForm) -> RequirementForm) = _form.update { transform(it).copy(errors = emptyMap()) }

    fun searchLocations(q: String) = viewModelScope.launch {
        if (q.length < 2) { locationResults.value = emptyList(); return@launch }
        locationResults.value = (metaRepo.searchLocations(q) as? ApiResult.Success)?.data ?: emptyList()
    }

    fun pickLocation(loc: Location) {
        locationResults.value = emptyList()
        edit { it.copy(location = loc, city = loc.city, pincode = loc.pincode, locality = loc.locality, latitude = loc.latitude, longitude = loc.longitude) }
    }

    fun useCurrentLocation() = viewModelScope.launch {
        locating.value = true
        val here = locationProvider.current()
        locating.value = false
        if (here == null) {
            error.value = "Couldn't get your location. Choose a locality instead."
        } else {
            edit { it.copy(latitude = here.latitude, longitude = here.longitude, location = null) }
        }
    }

    fun submit() {
        val f = _form.value
        val errors = buildMap {
            if (f.student == null) put("student", "Select a child")
            if (f.subjects.isEmpty()) put("subjects", "Select at least one subject")
            if (f.preferredTime.isBlank()) put("time", "Enter a preferred time, e.g. Evening 5-7 PM")
            val budget = f.budget.toIntOrNull()
            if (budget == null || budget < 100) put("budget", "Enter a monthly budget (₹100 or more)")
            if (f.city.isBlank()) put("city", "Enter your city")
            Validators.pincode(f.pincode)?.let { put("pincode", it) }
            if (f.mode != "ONLINE" && (f.latitude == null || f.longitude == null)) {
                put("location", "Pick a locality or use your current location so nearby tutors can find you")
            }
        }
        if (errors.isNotEmpty()) {
            _form.update { it.copy(errors = errors) }
            return
        }
        val req = RequirementRequest(
            studentId = f.student!!.id,
            subjectIds = f.subjects.map { it.id },
            daysPerWeek = f.daysPerWeek,
            preferredTime = f.preferredTime.trim(),
            preferredTutorGender = f.tutorGender,
            monthlyBudget = f.budget.toInt(),
            mode = f.mode,
            locationId = f.location?.id,
            locality = f.locality.ifBlank { null },
            city = f.city.trim(),
            pincode = f.pincode.trim(),
            latitude = f.latitude,
            longitude = f.longitude,
            additionalNotes = f.notes.trim().ifBlank { null },
        )
        viewModelScope.launch {
            saving.value = true
            val result = if (editingId == null) requirements.create(req) else requirements.update(editingId, req)
            saving.value = false
            when (result) {
                is ApiResult.Success -> savedId.value = result.data.id
                is ApiResult.Failure -> error.value = (listOf(result.message) + result.details).joinToString("\n")
            }
        }
    }
}

private val TIME_SUGGESTIONS = listOf("Morning", "Afternoon", "Evening 4-6 PM", "Evening 6-8 PM", "Weekends")

@Composable
fun PostRequirementScreen(
    onBack: () -> Unit,
    onManageChildren: () -> Unit,
    onDone: (String) -> Unit,
    vm: PostRequirementViewModel = hiltViewModel(),
) {
    val data by vm.data.collectAsStateWithLifecycle()
    val f by vm.form.collectAsStateWithLifecycle()
    val saving by vm.saving.collectAsStateWithLifecycle()
    val locating by vm.locating.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val savedId by vm.savedId.collectAsStateWithLifecycle()
    val results by vm.locationResults.collectAsStateWithLifecycle()
    var locationQuery by remember { mutableStateOf("") }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted.values.any { it }) vm.useCurrentLocation() else vm.error.value = "Location permission denied. Choose a locality instead."
    }

    LaunchedEffect(savedId) { savedId?.let(onDone) }

    Scaffold(topBar = { BackBar(if (vm.editingId == null) "Post a requirement" else "Edit requirement", onBack) }) { padding ->
        Box(Modifier.padding(padding)) {
            UiContent(data, onRetry = { vm.load() }) { d ->
                if (d.students.isEmpty()) {
                    EmptyState(
                        "Add a child first",
                        "Tell us who the tuition is for — you can add several children.",
                        action = { Button(onClick = onManageChildren) { Text("Add child") } },
                    )
                    return@UiContent
                }
                Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                    SectionTitle("Student")
                    DropdownField("Child", d.students, f.student, { "${it.name} • ${it.className}" }, { s -> vm.edit { it.copy(student = s) } }, error = f.errors["student"])

                    SectionTitle("Subjects")
                    MultiSelectChips(d.meta.subjects, f.subjects, { it.name }) { s ->
                        vm.edit { it.copy(subjects = if (s in it.subjects) it.subjects - s else it.subjects + s) }
                    }
                    f.errors["subjects"]?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

                    SectionTitle("Schedule")
                    Text("Days per week: ${f.daysPerWeek}", style = MaterialTheme.typography.bodyMedium)
                    Slider(value = f.daysPerWeek.toFloat(), onValueChange = { v -> vm.edit { it.copy(daysPerWeek = v.toInt()) } }, valueRange = 1f..7f, steps = 5)
                    FormField(f.preferredTime, { v -> vm.edit { it.copy(preferredTime = v) } }, "Preferred timing", error = f.errors["time"])
                    SingleSelectChips(TIME_SUGGESTIONS, f.preferredTime, { it }) { t -> vm.edit { it.copy(preferredTime = t) } }

                    SectionTitle("Tutor preferences")
                    Text("Mode", style = MaterialTheme.typography.labelLarge)
                    SingleSelectChips(listOf("HOME", "ONLINE", "EITHER"), f.mode, { mapOf("HOME" to "Home tuition", "ONLINE" to "Online", "EITHER" to "Either")[it]!! }) { m ->
                        vm.edit { it.copy(mode = m) }
                    }
                    Spacer(Modifier.height(8.dp))
                    Text("Preferred tutor gender", style = MaterialTheme.typography.labelLarge)
                    SingleSelectChips(listOf("ANY", "FEMALE", "MALE"), f.tutorGender, { mapOf("ANY" to "No preference", "FEMALE" to "Female", "MALE" to "Male")[it]!! }) { g ->
                        vm.edit { it.copy(tutorGender = g) }
                    }
                    Spacer(Modifier.height(8.dp))
                    FormField(f.budget, { v -> vm.edit { it.copy(budget = v.filter(Char::isDigit).take(6)) } }, "Monthly budget", error = f.errors["budget"], keyboardType = KeyboardType.Number, prefix = "₹ ")

                    SectionTitle("Location")
                    Text(
                        "Tutors only see your locality and an approximate distance — never your exact address.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = locationQuery,
                        onValueChange = { locationQuery = it; vm.searchLocations(it) },
                        label = { Text("Search locality, city or pincode") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    results.take(6).forEach { loc ->
                        ListItem(
                            headlineContent = { Text(loc.locality) },
                            supportingContent = { Text("${loc.city} - ${loc.pincode}") },
                            modifier = Modifier.fillMaxWidth().padding(0.dp),
                            trailingContent = { TextButton(onClick = { vm.pickLocation(loc); locationQuery = loc.label }) { Text("Select") } },
                        )
                    }
                    OutlinedButton(
                        onClick = {
                            permission.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
                        },
                        enabled = !locating,
                        modifier = Modifier.padding(top = 8.dp),
                    ) {
                        Icon(Icons.Filled.MyLocation, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(if (locating) "Locating…" else "Use my current location")
                    }
                    if (f.latitude != null) {
                        Text("✓ Location set", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
                    }
                    f.errors["location"]?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    Spacer(Modifier.height(8.dp))
                    FormField(f.locality, { v -> vm.edit { it.copy(locality = v) } }, "Locality / area")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FormField(f.city, { v -> vm.edit { it.copy(city = v) } }, "City", Modifier.weight(1f), error = f.errors["city"])
                        FormField(f.pincode, { v -> vm.edit { it.copy(pincode = v.filter(Char::isDigit).take(6)) } }, "Pincode", Modifier.weight(1f), error = f.errors["pincode"], keyboardType = KeyboardType.Number)
                    }

                    SectionTitle("Anything else?")
                    FormField(f.notes, { v -> vm.edit { it.copy(notes = v) } }, "Additional requirements (optional)", singleLine = false, minLines = 3)

                    error?.let {
                        Spacer(Modifier.height(12.dp))
                        InfoBanner(it, Tone.Error)
                    }
                    Spacer(Modifier.height(20.dp))
                    PrimaryButton(if (vm.editingId == null) "Post requirement" else "Save changes", vm::submit, loading = saving)
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}
