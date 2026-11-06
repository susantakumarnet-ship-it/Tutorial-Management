@file:OptIn(ExperimentalMaterial3Api::class)

package com.smarttuition.app.feature.account

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.outlined.ChildCare
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PrivacyTip
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
import com.smarttuition.app.BuildConfig
import com.smarttuition.app.core.network.ApiResult
import com.smarttuition.app.core.session.SessionManager
import com.smarttuition.app.core.session.SessionState
import com.smarttuition.app.core.util.Validators
import com.smarttuition.app.core.util.statusLabel
import com.smarttuition.app.data.model.ParentProfileUpdate
import com.smarttuition.app.data.model.Role
import com.smarttuition.app.data.repository.AuthRepository
import com.smarttuition.app.data.repository.ParentRepository
import com.smarttuition.app.ui.components.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AccountViewModel @Inject constructor(
    val session: SessionManager,
    private val auth: AuthRepository,
    private val parents: ParentRepository,
) : ViewModel() {
    val message = MutableStateFlow<String?>(null)
    val saving = MutableStateFlow(false)

    fun logout() = viewModelScope.launch { auth.logout() }

    fun saveParent(name: String, email: String, address: String, city: String, pincode: String, onDone: () -> Unit) = viewModelScope.launch {
        saving.value = true
        val r = parents.updateProfile(
            ParentProfileUpdate(
                fullName = name.trim(),
                email = email.trim(),
                addressLine = address.trim().ifBlank { null },
                city = city.trim().ifBlank { null },
                pincode = pincode.trim().ifBlank { null },
            ),
        )
        saving.value = false
        when (r) {
            is ApiResult.Success -> { auth.refreshUser(); message.value = "Profile updated"; onDone() }
            is ApiResult.Failure -> message.value = r.message
        }
    }

    suspend fun loadParent() = (parents.profile() as? ApiResult.Success)?.data
}

@Composable
fun AccountScreen(
    onEditTutorProfile: () -> Unit,
    onManageChildren: () -> Unit,
    onNotifications: () -> Unit,
    vm: AccountViewModel = hiltViewModel(),
) {
    val session by vm.session.state.collectAsStateWithLifecycle()
    val user = (session as? SessionState.LoggedIn)?.user ?: return
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var confirmLogout by remember { mutableStateOf(false) }
    var editParent by remember { mutableStateOf(false) }
    LaunchedEffect(message) { message?.let { snackbar.showSnackbar(it); vm.message.value = null } }

    Scaffold(topBar = { TopAppBar(title = { Text("Account") }) }, snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Column(Modifier.padding(padding).verticalScroll(rememberScrollState())) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(user.fullName, user.photoUrl, 64.dp)
                Spacer(Modifier.width(16.dp))
                Column {
                    Text(user.fullName, style = MaterialTheme.typography.titleLarge)
                    Text(user.phone, style = MaterialTheme.typography.bodyMedium)
                    user.email?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    Spacer(Modifier.height(4.dp))
                    if (user.role == Role.TUTOR) {
                        StatusPill(statusLabel(user.tutorVerificationStatus ?: "DRAFT"), toneFor(user.tutorVerificationStatus ?: "DRAFT"))
                    } else {
                        StatusPill("Parent", Tone.Info)
                    }
                }
            }
            HorizontalDivider()
            if (user.role == Role.TUTOR) {
                AccountItem(Icons.Outlined.Person, "Tutor profile", "Subjects, fees, availability, documents", onEditTutorProfile)
            } else {
                AccountItem(Icons.Outlined.Person, "Personal details", "Name, email and home address") { editParent = true }
                AccountItem(Icons.Outlined.ChildCare, "My children", "Add or edit children", onManageChildren)
            }
            AccountItem(Icons.Outlined.Notifications, "Notifications", "Requests, responses and updates", onNotifications)
            AccountItem(
                Icons.Outlined.PrivacyTip,
                "Privacy",
                if (user.role == Role.PARENT) "Tutors never see your exact address. Contact details are shared only with tutors you accept."
                else "Your phone and email are shared only with parents whose requests you accept.",
            ) {}
            HorizontalDivider()
            ListItem(
                modifier = Modifier.clickable { confirmLogout = true },
                headlineContent = { Text("Log out", color = MaterialTheme.colorScheme.error) },
                leadingContent = { Icon(Icons.AutoMirrored.Filled.Logout, null, tint = MaterialTheme.colorScheme.error) },
            )
            Text(
                "Version ${BuildConfig.VERSION_NAME}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(16.dp),
            )
        }
    }

    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text("Log out?") },
            confirmButton = { TextButton(onClick = { confirmLogout = false; vm.logout() }) { Text("Log out") } },
            dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text("Cancel") } },
        )
    }
    if (editParent) ParentDetailsDialog(vm) { editParent = false }
}

@Composable
private fun AccountItem(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    ListItem(
        modifier = Modifier.clickable(onClick = onClick),
        leadingContent = { Icon(icon, null) },
        headlineContent = { Text(title) },
        supportingContent = { Text(subtitle) },
    )
}

@Composable
private fun ParentDetailsDialog(vm: AccountViewModel, onDismiss: () -> Unit) {
    var loaded by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }
    var pincode by remember { mutableStateOf("") }
    val saving by vm.saving.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) {
        vm.loadParent()?.let { p ->
            name = p.fullName; email = p.email ?: ""; address = p.addressLine ?: ""; city = p.city ?: ""; pincode = p.pincode ?: ""
        }
        loaded = true
    }
    val valid = Validators.name(name) == null && Validators.email(email) == null && (pincode.isBlank() || Validators.pincode(pincode) == null)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Personal details") },
        text = {
            if (!loaded) {
                Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            } else {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    FormField(name, { name = it }, "Full name")
                    FormField(email, { email = it }, "Email", keyboardType = KeyboardType.Email)
                    FormField(address, { address = it }, "Home address (private)", supporting = "Never shown to tutors")
                    FormField(city, { city = it }, "City")
                    FormField(pincode, { pincode = it.filter(Char::isDigit).take(6) }, "Pincode", keyboardType = KeyboardType.Number)
                }
            }
        },
        confirmButton = {
            TextButton(enabled = loaded && valid && !saving, onClick = { vm.saveParent(name, email, address, city, pincode, onDismiss) }) {
                Text(if (saving) "Saving…" else "Save")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
