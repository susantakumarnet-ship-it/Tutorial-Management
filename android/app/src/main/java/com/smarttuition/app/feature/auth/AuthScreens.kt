@file:OptIn(ExperimentalMaterial3Api::class)

package com.smarttuition.app.feature.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.FamilyRestroom
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.smarttuition.app.data.model.Role
import com.smarttuition.app.ui.components.FormField
import com.smarttuition.app.ui.components.InfoBanner
import com.smarttuition.app.ui.components.PrimaryButton
import com.smarttuition.app.ui.components.Tone
import com.smarttuition.app.ui.theme.Amber
import com.smarttuition.app.ui.theme.Indigo
import com.smarttuition.app.ui.theme.IndigoDark

// ---------------------------------------------------------------------------
// Welcome
// ---------------------------------------------------------------------------

@Composable
fun WelcomeScreen(onGetStarted: () -> Unit, onLogin: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(IndigoDark, Indigo)))
            .systemBarsPadding()
            .padding(24.dp),
    ) {
        Spacer(Modifier.height(32.dp))
        Icon(Icons.Filled.School, null, tint = Amber, modifier = Modifier.size(56.dp))
        Spacer(Modifier.height(16.dp))
        Text("Smart Tuition", style = MaterialTheme.typography.headlineLarge, color = Color.White)
        Spacer(Modifier.height(8.dp))
        Text(
            "The right tutor for every child — and the right students for every tutor.",
            style = MaterialTheme.typography.bodyLarge,
            color = Color.White.copy(alpha = 0.85f),
        )
        Spacer(Modifier.height(32.dp))
        Feature(Icons.Filled.Verified, "Verified tutors", "Every tutor's documents are checked by our team.")
        Feature(Icons.Filled.LocationOn, "Nearby or online", "Find tutors around you, filtered by class, subject and board.")
        Feature(Icons.Filled.Groups, "Privacy first", "Your contact details are shared only with tutors you accept.")
        Spacer(Modifier.weight(1f))
        Button(
            onClick = onGetStarted,
            colors = ButtonDefaults.buttonColors(containerColor = Amber, contentColor = Color(0xFF1F1300)),
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
        ) { Text("Get started") }
        Spacer(Modifier.height(8.dp))
        TextButton(onClick = onLogin, modifier = Modifier.fillMaxWidth()) {
            Text("I already have an account", color = Color.White)
        }
    }
}

@Composable
private fun Feature(icon: ImageVector, title: String, body: String) {
    Row(Modifier.padding(vertical = 10.dp)) {
        Icon(icon, null, tint = Amber, modifier = Modifier.size(24.dp))
        Spacer(Modifier.width(14.dp))
        Column {
            Text(title, style = MaterialTheme.typography.titleMedium, color = Color.White)
            Text(body, style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.8f))
        }
    }
}

// ---------------------------------------------------------------------------
// Role selection
// ---------------------------------------------------------------------------

@Composable
fun RoleSelectScreen(onBack: () -> Unit, onRole: (Role) -> Unit) {
    Scaffold(topBar = { BackBar("", onBack) }) { padding ->
        Column(Modifier.padding(padding).padding(24.dp)) {
            Text("How will you use Smart Tuition?", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(8.dp))
            Text("You can't change this later, so pick the one that fits you.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(24.dp))
            RoleCard(Icons.Filled.FamilyRestroom, "I'm a Parent / Student", "Find verified tutors and post tuition requirements for your children.") { onRole(Role.PARENT) }
            Spacer(Modifier.height(16.dp))
            RoleCard(Icons.Filled.School, "I'm a Tutor", "Create your teaching profile and find students near you or online.") { onRole(Role.TUTOR) }
        }
    }
}

@Composable
private fun RoleCard(icon: ImageVector, title: String, body: String, onClick: () -> Unit) {
    OutlinedCard(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(56.dp).background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(16.dp)),
                contentAlignment = Alignment.Center,
            ) { Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(30.dp)) }
            Spacer(Modifier.width(16.dp))
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

@Composable
fun RegisterScreen(
    onBack: () -> Unit,
    onOtpSent: (phone: String, masked: String, devOtp: String?) -> Unit,
    onLogin: () -> Unit,
    vm: RegisterViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.navigateToOtp) {
        s.navigateToOtp?.let { onOtpSent(it.phone, it.masked, it.devOtp); vm.navigated() }
    }
    Scaffold(topBar = { BackBar("Create account", onBack) }) { padding ->
        Column(Modifier.padding(padding).verticalScroll(rememberScrollState()).padding(24.dp)) {
            Text(
                if (vm.role == Role.TUTOR) "Join as a tutor" else "Join as a parent",
                style = MaterialTheme.typography.headlineMedium,
            )
            Spacer(Modifier.height(4.dp))
            Text("We'll send a one-time code to verify your mobile number.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(20.dp))
            FormField(s.fullName, vm::onName, "Full name", error = s.nameError)
            Spacer(Modifier.height(8.dp))
            FormField(s.phone, vm::onPhone, "Mobile number", error = s.phoneError, keyboardType = KeyboardType.Phone, prefix = "+91 ")
            Spacer(Modifier.height(8.dp))
            FormField(s.email, vm::onEmail, "Email", error = s.emailError, keyboardType = KeyboardType.Email)
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = s.acceptedTerms, onCheckedChange = vm::onTerms)
                Text("I agree to the Terms of Service and Privacy Policy", style = MaterialTheme.typography.bodyMedium)
            }
            s.error?.let {
                Spacer(Modifier.height(8.dp))
                InfoBanner(it, Tone.Error)
            }
            Spacer(Modifier.height(16.dp))
            PrimaryButton("Send OTP", vm::submit, loading = s.loading)
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = onLogin, modifier = Modifier.fillMaxWidth()) { Text("Already registered? Log in") }
        }
    }
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

@Composable
fun LoginScreen(
    onBack: () -> Unit,
    onOtpSent: (phone: String, masked: String, devOtp: String?) -> Unit,
    onRegister: () -> Unit,
    vm: LoginViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.navigateToOtp) {
        s.navigateToOtp?.let { onOtpSent(it.phone, it.masked, it.devOtp); vm.navigated() }
    }
    Scaffold(topBar = { BackBar("Log in", onBack) }) { padding ->
        Column(Modifier.padding(padding).padding(24.dp)) {
            Text("Welcome back", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(4.dp))
            Text("Enter your registered mobile number.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(20.dp))
            FormField(s.phone, vm::onPhone, "Mobile number", error = s.phoneError, keyboardType = KeyboardType.Phone, prefix = "+91 ")
            s.error?.let {
                Spacer(Modifier.height(8.dp))
                InfoBanner(it, Tone.Error, action = if (s.notRegistered) ({ TextButton(onClick = onRegister) { Text("Sign up") } }) else null)
            }
            Spacer(Modifier.height(16.dp))
            PrimaryButton("Send OTP", vm::submit, loading = s.loading)
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = onRegister, modifier = Modifier.fillMaxWidth()) { Text("New to Smart Tuition? Create an account") }
        }
    }
}

// ---------------------------------------------------------------------------
// OTP verification
// ---------------------------------------------------------------------------

@Composable
fun OtpScreen(onBack: () -> Unit, vm: OtpViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }

    Scaffold(topBar = { BackBar("Verify number", onBack) }) { padding ->
        Column(Modifier.padding(padding).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Enter the 6-digit code", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(4.dp))
            Text("Sent to ${s.masked}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(24.dp))

            BasicTextField(
                value = s.code,
                onValueChange = vm::onCode,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                modifier = Modifier.focusRequester(focus),
                decorationBox = {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        repeat(6) { i ->
                            val char = s.code.getOrNull(i)?.toString() ?: ""
                            val active = i == s.code.length
                            Box(
                                Modifier
                                    .size(width = 46.dp, height = 56.dp)
                                    .border(
                                        width = if (active) 2.dp else 1.dp,
                                        color = if (s.error != null) MaterialTheme.colorScheme.error
                                        else if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                                        shape = RoundedCornerShape(12.dp),
                                    ),
                                contentAlignment = Alignment.Center,
                            ) { Text(char, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold) }
                        }
                    }
                },
            )

            s.devOtp?.let {
                Spacer(Modifier.height(16.dp))
                InfoBanner("Development mode: your code is $it", Tone.Warning)
            }
            s.info?.let {
                Spacer(Modifier.height(12.dp))
                InfoBanner(it, Tone.Success)
            }
            s.error?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center)
            }
            Spacer(Modifier.height(24.dp))
            PrimaryButton("Verify", vm::verify, enabled = s.code.length == 6, loading = s.loading)
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = vm::resend, enabled = s.secondsLeft == 0) {
                Text(if (s.secondsLeft > 0) "Resend code in ${s.secondsLeft}s" else "Resend code")
            }
        }
    }
}

@Composable
fun BackBar(title: String, onBack: () -> Unit, actions: @Composable RowScope.() -> Unit = {}) {
    TopAppBar(
        title = { Text(title) },
        navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
        actions = actions,
    )
}
