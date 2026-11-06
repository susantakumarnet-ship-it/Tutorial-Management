@file:OptIn(ExperimentalMaterial3Api::class)

package com.smarttuition.app.feature.tutor

import android.Manifest
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Description
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
import com.smarttuition.app.core.util.Validators
import com.smarttuition.app.core.util.statusLabel
import com.smarttuition.app.data.model.*
import com.smarttuition.app.data.repository.AuthRepository
import com.smarttuition.app.data.repository.MetaRepository
import com.smarttuition.app.data.repository.TutorRepository
import com.smarttuition.app.feature.auth.BackBar
import com.smarttuition.app.ui.components.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TutorForm(
    val fullName: String = "",
    val email: String = "",
    val headline: String = "",
    val bio: String = "",
    val gender: String? = null,
    val experienceYears: String = "0",
    val experienceDetails: String = "",
    val monthlyFee: String = "",
    val teachingMode: String = "OFFLINE",
    val subjects: Set<Int> = emptySet(),
    val classes: Set<Int> = emptySet(),
    val boards: Set<Int> = emptySet(),
    val locationId: Int? = null,
    val locality: String = "",
    val city: String = "",
    val pincode: String = "",
    val latitude: Double? = null,
    val longitude: Double? = null,
    val serviceRadiusKm: Int = 5,
    val qualifications: List<QualificationInput> = emptyList(),
    val slots: List<SlotInput> = emptyList(),
    val errors: Map<String, String> = emptyMap(),
)

private fun TutorOwnProfile.toForm() = TutorForm(
    fullName = fullName,
    email = email ?: "",
    headline = headline ?: "",
    bio = bio ?: "",
    gender = gender,
    experienceYears = experienceYears.toString(),
    experienceDetails = experienceDetails ?: "",
    monthlyFee = monthlyFee?.toString() ?: "",
    teachingMode = teachingMode,
    subjects = subjects.map { it.id }.toSet(),
    classes = classes.map { it.id }.toSet(),
    boards = boards.map { it.id }.toSet(),
    locationId = locationId,
    locality = locality ?: "",
    city = city ?: "",
    pincode = pincode ?: "",
    latitude = latitude,
    longitude = longitude,
    serviceRadiusKm = serviceRadiusKm,
    qualifications = qualifications.map { QualificationInput(it.degree, it.institution, it.year) },
    slots = availability.map { SlotInput(it.dayOfWeek, it.startTime, it.endTime) },
)

data class EditTutorData(val profile: TutorOwnProfile, val meta: MetaData)

@HiltViewModel
class EditTutorProfileViewModel @Inject constructor(
    private val tutors: TutorRepository,
    private val metaRepo: MetaRepository,
    private val location: LocationProvider,
    private val auth: AuthRepository,
) : ViewModel() {
    private val _data = MutableStateFlow<Ui<EditTutorData>>(Ui.Loading)
    val data = _data.asStateFlow()
    private val _form = MutableStateFlow(TutorForm())
    val form = _form.asStateFlow()
    val saving = MutableStateFlow(false)
    val uploading = MutableStateFlow(false)
    val message = MutableStateFlow<String?>(null)
    val locationResults = MutableStateFlow<List<Location>>(emptyList())

    init { load() }

    fun load() = viewModelScope.launch {
        _data.value = Ui.Loading
        val meta = metaRepo.meta()
        val profile = tutors.myProfile()
        if (meta is ApiResult.Success && profile is ApiResult.Success) {
            _form.value = profile.data.toForm()
            _data.value = Ui.Data(EditTutorData(profile.data, meta.data))
        } else {
            _data.value = Ui.Error(((meta as? ApiResult.Failure) ?: (profile as ApiResult.Failure)).message)
        }
    }

    /** Refreshes profile-derived data (photo, documents, completeness) without discarding unsaved form edits. */
    private suspend fun reloadProfileOnly() {
        val current = (_data.value as? Ui.Data)?.value ?: return
        (tutors.myProfile() as? ApiResult.Success)?.let { _data.value = Ui.Data(current.copy(profile = it.data)) }
    }

    fun edit(transform: (TutorForm) -> TutorForm) = _form.update { transform(it).copy(errors = emptyMap()) }

    fun searchLocations(q: String) = viewModelScope.launch {
        locationResults.value = if (q.length < 2) emptyList() else (metaRepo.searchLocations(q) as? ApiResult.Success)?.data ?: emptyList()
    }

    fun pickLocation(l: Location) {
        locationResults.value = emptyList()
        edit { it.copy(locationId = l.id, locality = l.locality, city = l.city, pincode = l.pincode, latitude = l.latitude, longitude = l.longitude) }
    }

    fun useCurrentLocation() = viewModelScope.launch {
        val here = location.current()
        if (here == null) message.value = "Couldn't get your location. Choose a locality instead."
        else edit { it.copy(latitude = here.latitude, longitude = here.longitude, locationId = null) }
    }

    fun uploadPhoto(uri: Uri) = viewModelScope.launch {
        uploading.value = true
        val r = tutors.uploadPhoto(uri)
        uploading.value = false
        when (r) {
            is ApiResult.Success -> { message.value = "Photo updated"; reloadProfileOnly() }
            is ApiResult.Failure -> message.value = r.message
        }
    }

    fun uploadDocument(uri: Uri, type: String) = viewModelScope.launch {
        uploading.value = true
        val r = tutors.uploadDocument(uri, type)
        uploading.value = false
        when (r) {
            is ApiResult.Success -> { message.value = "Document uploaded"; reloadProfileOnly() }
            is ApiResult.Failure -> message.value = r.message
        }
    }

    fun deleteDocument(id: String) = viewModelScope.launch {
        when (val r = tutors.deleteDocument(id)) {
            is ApiResult.Success -> { message.value = "Document removed"; reloadProfileOnly() }
            is ApiResult.Failure -> message.value = r.message
        }
    }

    fun save(onSaved: () -> Unit) {
        val f = _form.value
        val errors = buildMap {
            Validators.name(f.fullName)?.let { put("fullName", it) }
            Validators.email(f.email)?.let { put("email", it) }
            if (f.monthlyFee.isNotBlank() && (f.monthlyFee.toIntOrNull() ?: 0) < 100) put("monthlyFee", "Minimum ₹100")
            if (f.pincode.isNotBlank()) Validators.pincode(f.pincode)?.let { put("pincode", it) }
            if ((f.experienceYears.toIntOrNull() ?: -1) !in 0..60) put("experienceYears", "Enter 0–60")
        }
        if (errors.isNotEmpty()) {
            _form.update { it.copy(errors = errors) }
            message.value = "Please fix the highlighted fields"
            return
        }
        viewModelScope.launch {
            saving.value = true
            val update = TutorProfileUpdate(
                fullName = f.fullName.trim(),
                email = f.email.trim(),
                headline = f.headline.trim(),
                bio = f.bio.trim(),
                gender = f.gender,
                experienceYears = f.experienceYears.toInt(),
                experienceDetails = f.experienceDetails.trim(),
                monthlyFee = f.monthlyFee.toIntOrNull(),
                teachingMode = f.teachingMode,
                locationId = f.locationId,
                locality = f.locality.trim().ifBlank { null },
                city = f.city.trim().ifBlank { null },
                pincode = f.pincode.trim().ifBlank { null },
                latitude = f.latitude,
                longitude = f.longitude,
                serviceRadiusKm = f.serviceRadiusKm,
                subjectIds = f.subjects.toList(),
                classIds = f.classes.toList(),
                boardIds = f.boards.toList(),
            )
            val results = listOf(
                tutors.updateProfile(update),
                tutors.updateQualifications(f.qualifications),
                tutors.updateAvailability(f.slots),
            )
            saving.value = false
            val failure = results.filterIsInstance<ApiResult.Failure>().firstOrNull()
            if (failure != null) {
                message.value = (listOf(failure.message) + failure.details).joinToString("\n")
            } else {
                auth.refreshUser()
                message.value = "Profile saved"
                onSaved()
            }
        }
    }
}

private val TIMES = (12..44).map { half -> "%02d:%02d".format(half / 2, if (half % 2 == 0) 0 else 30) } // 06:00 – 22:00

@Composable
fun EditTutorProfileScreen(onBack: () -> Unit, vm: EditTutorProfileViewModel = hiltViewModel()) {
    val data by vm.data.collectAsStateWithLifecycle()
    val f by vm.form.collectAsStateWithLifecycle()
    val saving by vm.saving.collectAsStateWithLifecycle()
    val uploading by vm.uploading.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val results by vm.locationResults.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var locationQuery by remember { mutableStateOf("") }
    var pendingDocType by remember { mutableStateOf("QUALIFICATION") }
    var showQualification by remember { mutableStateOf(false) }
    var showSlot by remember { mutableStateOf(false) }

    LaunchedEffect(message) { message?.let { snackbar.showSnackbar(it); vm.message.value = null } }

    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let(vm::uploadPhoto) }
    val docPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let { vm.uploadDocument(it, pendingDocType) } }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted.values.any { it }) vm.useCurrentLocation()
    }

    Scaffold(
        topBar = { BackBar("My tutor profile", onBack) },
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            if (data is Ui.Data) Surface(tonalElevation = 3.dp) {
                Box(Modifier.navigationBarsPadding().padding(16.dp)) {
                    PrimaryButton("Save profile", { vm.save(onSaved = {}) }, loading = saving)
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            UiContent(data, onRetry = { vm.load() }) { d ->
                val p = d.profile
                Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                    if (p.verificationStatus == "REJECTED" && p.verificationNote != null) {
                        InfoBanner("Changes requested: ${p.verificationNote}", Tone.Error)
                        Spacer(Modifier.height(12.dp))
                    }

                    // ---------- Photo ----------
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(f.fullName.ifBlank { p.fullName }, p.photoUrl, 88.dp)
                        Spacer(Modifier.width(16.dp))
                        Column {
                            Text("Profile photo", style = MaterialTheme.typography.titleSmall)
                            Text("A clear, friendly face photo builds trust.", style = MaterialTheme.typography.bodySmall)
                            TextButton(
                                onClick = { photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                                enabled = !uploading,
                            ) {
                                Icon(Icons.Filled.CameraAlt, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
                                Text(if (p.photoUrl == null) "Upload photo" else "Change photo")
                            }
                        }
                    }

                    // ---------- Basic ----------
                    SectionTitle("About you")
                    FormField(f.fullName, { v -> vm.edit { it.copy(fullName = v) } }, "Full name", error = f.errors["fullName"])
                    FormField(f.email, { v -> vm.edit { it.copy(email = v) } }, "Email", error = f.errors["email"], keyboardType = KeyboardType.Email)
                    FormField(f.headline, { v -> vm.edit { it.copy(headline = v.take(160)) } }, "Headline", supporting = "e.g. Maths & Science made simple for Class 6–10")
                    FormField(f.bio, { v -> vm.edit { it.copy(bio = v.take(2000)) } }, "About your teaching", singleLine = false, minLines = 3)
                    Text("Gender", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp))
                    SingleSelectChips(listOf("FEMALE", "MALE", "OTHER"), f.gender, ::statusLabel) { g -> vm.edit { it.copy(gender = g) } }

                    // ---------- Teaching ----------
                    SectionTitle("Subjects you teach")
                    MultiSelectChips(d.meta.subjects, d.meta.subjects.filter { it.id in f.subjects }.toSet(), { it.name }) { s ->
                        vm.edit { it.copy(subjects = if (s.id in it.subjects) it.subjects - s.id else it.subjects + s.id) }
                    }
                    SectionTitle("Classes you teach")
                    MultiSelectChips(d.meta.classes, d.meta.classes.filter { it.id in f.classes }.toSet(), { it.name }) { c ->
                        vm.edit { it.copy(classes = if (c.id in it.classes) it.classes - c.id else it.classes + c.id) }
                    }
                    SectionTitle("Boards")
                    MultiSelectChips(d.meta.boards, d.meta.boards.filter { it.id in f.boards }.toSet(), { it.code }) { b ->
                        vm.edit { it.copy(boards = if (b.id in it.boards) it.boards - b.id else it.boards + b.id) }
                    }
                    SectionTitle("Fees, mode & experience")
                    SingleSelectChips(listOf("OFFLINE", "ONLINE", "BOTH"), f.teachingMode, { mapOf("OFFLINE" to "Home tuition", "ONLINE" to "Online", "BOTH" to "Both")[it]!! }) { m ->
                        vm.edit { it.copy(teachingMode = m) }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FormField(f.monthlyFee, { v -> vm.edit { it.copy(monthlyFee = v.filter(Char::isDigit).take(6)) } }, "Monthly fee", Modifier.weight(1f), error = f.errors["monthlyFee"], keyboardType = KeyboardType.Number, prefix = "₹ ")
                        FormField(f.experienceYears, { v -> vm.edit { it.copy(experienceYears = v.filter(Char::isDigit).take(2)) } }, "Experience (yrs)", Modifier.weight(1f), error = f.errors["experienceYears"], keyboardType = KeyboardType.Number)
                    }
                    FormField(f.experienceDetails, { v -> vm.edit { it.copy(experienceDetails = v.take(2000)) } }, "Teaching experience details", singleLine = false, minLines = 2)

                    // ---------- Location ----------
                    SectionTitle("Teaching location")
                    OutlinedTextField(
                        value = locationQuery,
                        onValueChange = { locationQuery = it; vm.searchLocations(it) },
                        label = { Text("Search locality, city or pincode") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    results.take(6).forEach { loc ->
                        ListItem(
                            headlineContent = { Text(loc.locality) },
                            supportingContent = { Text("${loc.city} - ${loc.pincode}") },
                            trailingContent = { TextButton(onClick = { vm.pickLocation(loc); locationQuery = loc.label }) { Text("Select") } },
                        )
                    }
                    OutlinedButton(onClick = { permission.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION)) }, modifier = Modifier.padding(top = 8.dp)) {
                        Icon(Icons.Filled.MyLocation, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Use my current location")
                    }
                    if (f.latitude != null) Text("✓ Location set", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
                    FormField(f.locality, { v -> vm.edit { it.copy(locality = v) } }, "Locality")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FormField(f.city, { v -> vm.edit { it.copy(city = v) } }, "City", Modifier.weight(1f))
                        FormField(f.pincode, { v -> vm.edit { it.copy(pincode = v.filter(Char::isDigit).take(6)) } }, "Pincode", Modifier.weight(1f), error = f.errors["pincode"], keyboardType = KeyboardType.Number)
                    }
                    if (f.teachingMode != "ONLINE") {
                        Text("I can travel up to ${f.serviceRadiusKm} km", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
                        Slider(value = f.serviceRadiusKm.toFloat(), onValueChange = { v -> vm.edit { it.copy(serviceRadiusKm = v.toInt()) } }, valueRange = 1f..30f)
                    }

                    // ---------- Qualifications ----------
                    SectionTitle("Qualifications") { TextButton(onClick = { showQualification = true }) { Icon(Icons.Filled.Add, null); Text("Add") } }
                    if (f.qualifications.isEmpty()) Text("Add your degrees and certifications.", style = MaterialTheme.typography.bodySmall)
                    f.qualifications.forEachIndexed { i, q ->
                        ListItem(
                            headlineContent = { Text(q.degree) },
                            supportingContent = { Text(listOfNotNull(q.institution, q.year?.toString()).joinToString(", ")) },
                            trailingContent = {
                                IconButton(onClick = { vm.edit { it.copy(qualifications = it.qualifications.filterIndexed { j, _ -> j != i }) } }) {
                                    Icon(Icons.Outlined.Close, "Remove")
                                }
                            },
                        )
                    }

                    // ---------- Availability ----------
                    SectionTitle("Available days & times") { TextButton(onClick = { showSlot = true }) { Icon(Icons.Filled.Add, null); Text("Add") } }
                    if (f.slots.isEmpty()) Text("Add the time slots when you can take classes.", style = MaterialTheme.typography.bodySmall)
                    f.slots.sortedWith(compareBy({ it.dayOfWeek }, { it.startTime })).forEach { slot ->
                        ListItem(
                            headlineContent = { Text("${DAY_NAMES[slot.dayOfWeek]}  ${slot.startTime} – ${slot.endTime}") },
                            trailingContent = { IconButton(onClick = { vm.edit { it.copy(slots = it.slots - slot) } }) { Icon(Icons.Outlined.Close, "Remove") } },
                        )
                    }

                    // ---------- Documents ----------
                    SectionTitle("Verification documents")
                    Text(
                        "Upload qualification certificates (required) and experience letters or ID proof. PDF, JPG or PNG up to 5 MB. Documents are only visible to our verification team.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    p.documents.forEach { doc ->
                        ListItem(
                            leadingContent = { Icon(Icons.Outlined.Description, null) },
                            headlineContent = { Text(doc.originalName) },
                            supportingContent = { Text("${statusLabel(doc.docType)} • ${statusLabel(doc.status)}" + (doc.reviewNote?.let { " — $it" } ?: "")) },
                            trailingContent = {
                                if (doc.status != "APPROVED") IconButton(onClick = { vm.deleteDocument(doc.id) }) { Icon(Icons.Outlined.Delete, "Delete") }
                            },
                        )
                    }
                    Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        DropdownField(
                            "Document type",
                            listOf("QUALIFICATION", "EXPERIENCE", "ID_PROOF", "OTHER"),
                            pendingDocType,
                            ::statusLabel,
                            { pendingDocType = it },
                            Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(8.dp))
                        FilledTonalButton(onClick = { docPicker.launch(arrayOf("application/pdf", "image/jpeg", "image/png")) }, enabled = !uploading) {
                            Icon(Icons.Filled.UploadFile, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(if (uploading) "Uploading…" else "Upload")
                        }
                    }
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }

    if (showQualification) {
        QualificationDialog(onDismiss = { showQualification = false }) { q ->
            vm.edit { it.copy(qualifications = it.qualifications + q) }
            showQualification = false
        }
    }
    if (showSlot) {
        SlotDialog(onDismiss = { showSlot = false }) { newSlots ->
            vm.edit { it.copy(slots = (it.slots + newSlots).distinct()) }
            showSlot = false
        }
    }
}

@Composable
private fun QualificationDialog(onDismiss: () -> Unit, onAdd: (QualificationInput) -> Unit) {
    var degree by remember { mutableStateOf("") }
    var institution by remember { mutableStateOf("") }
    var year by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add qualification") },
        text = {
            Column {
                FormField(degree, { degree = it }, "Degree / certificate")
                FormField(institution, { institution = it }, "Institution (optional)")
                FormField(year, { year = it.filter(Char::isDigit).take(4) }, "Year (optional)", keyboardType = KeyboardType.Number)
            }
        },
        confirmButton = {
            TextButton(enabled = degree.trim().length >= 2, onClick = {
                onAdd(QualificationInput(degree.trim(), institution.trim().ifBlank { null }, year.toIntOrNull()?.takeIf { it in 1950..2100 }))
            }) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun SlotDialog(onDismiss: () -> Unit, onAdd: (List<SlotInput>) -> Unit) {
    var days by remember { mutableStateOf(setOf(1, 2, 3, 4, 5)) }
    var start by remember { mutableStateOf("16:00") }
    var end by remember { mutableStateOf("19:00") }
    val valid = days.isNotEmpty() && start < end
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add time slot") },
        text = {
            Column {
                Text("Days", style = MaterialTheme.typography.labelLarge)
                MultiSelectChips((0..6).toList(), days, { DAY_NAMES[it] }) { d -> days = if (d in days) days - d else days + d }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DropdownField("From", TIMES, start, { it }, { start = it }, Modifier.weight(1f))
                    DropdownField("To", TIMES, end, { it }, { end = it }, Modifier.weight(1f))
                }
                if (start >= end) Text("End time must be after start time", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            TextButton(enabled = valid, onClick = { onAdd(days.sorted().map { SlotInput(it, start, end) }) }) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
