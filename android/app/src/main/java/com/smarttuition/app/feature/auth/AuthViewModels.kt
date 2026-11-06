package com.smarttuition.app.feature.auth

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import com.smarttuition.app.core.network.ApiResult
import com.smarttuition.app.core.util.Validators
import com.smarttuition.app.data.model.OtpSent
import com.smarttuition.app.data.model.Role
import com.smarttuition.app.data.repository.AuthRepository
import com.smarttuition.app.ui.navigation.OtpRoute
import com.smarttuition.app.ui.navigation.RegisterRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class OtpNav(val phone: String, val masked: String, val devOtp: String?)

data class RegisterState(
    val fullName: String = "",
    val phone: String = "",
    val email: String = "",
    val acceptedTerms: Boolean = false,
    val nameError: String? = null,
    val phoneError: String? = null,
    val emailError: String? = null,
    val loading: Boolean = false,
    val error: String? = null,
    val navigateToOtp: OtpNav? = null,
)

@HiltViewModel
class RegisterViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val auth: AuthRepository,
) : ViewModel() {
    val role: Role = Role.valueOf(savedState.toRoute<RegisterRoute>().role)

    private val _state = MutableStateFlow(RegisterState())
    val state = _state.asStateFlow()

    fun onName(v: String) = _state.update { it.copy(fullName = v, nameError = null) }
    fun onPhone(v: String) = _state.update { it.copy(phone = v.filter(Char::isDigit).take(10), phoneError = null) }
    fun onEmail(v: String) = _state.update { it.copy(email = v.trim(), emailError = null) }
    fun onTerms(v: Boolean) = _state.update { it.copy(acceptedTerms = v) }
    fun navigated() = _state.update { it.copy(navigateToOtp = null) }

    fun submit() {
        val s = _state.value
        val errors = s.copy(nameError = Validators.name(s.fullName), phoneError = Validators.phone(s.phone), emailError = Validators.email(s.email))
        if (errors.nameError != null || errors.phoneError != null || errors.emailError != null) {
            _state.value = errors
            return
        }
        if (!s.acceptedTerms) {
            _state.update { it.copy(error = "Please accept the terms and privacy policy to continue.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            when (val r = auth.register(role, s.fullName.trim(), s.phone, s.email)) {
                is ApiResult.Success -> _state.update { it.copy(loading = false, navigateToOtp = OtpNav(s.phone, r.data.otpSentTo, r.data.devOtp)) }
                is ApiResult.Failure -> _state.update { it.copy(loading = false, error = r.message) }
            }
        }
    }
}

data class LoginState(
    val phone: String = "",
    val phoneError: String? = null,
    val loading: Boolean = false,
    val error: String? = null,
    val notRegistered: Boolean = false,
    val navigateToOtp: OtpNav? = null,
)

@HiltViewModel
class LoginViewModel @Inject constructor(private val auth: AuthRepository) : ViewModel() {
    private val _state = MutableStateFlow(LoginState())
    val state = _state.asStateFlow()

    fun onPhone(v: String) = _state.update { it.copy(phone = v.filter(Char::isDigit).take(10), phoneError = null, error = null, notRegistered = false) }
    fun navigated() = _state.update { it.copy(navigateToOtp = null) }

    fun submit() {
        val phone = _state.value.phone
        Validators.phone(phone)?.let { err -> _state.update { it.copy(phoneError = err) }; return }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            when (val r = auth.requestLoginOtp(phone)) {
                is ApiResult.Success -> _state.update { it.copy(loading = false, navigateToOtp = OtpNav(phone, r.data.otpSentTo, r.data.devOtp)) }
                is ApiResult.Failure -> _state.update {
                    it.copy(loading = false, notRegistered = r.httpCode == 404, error = if (r.httpCode == 404) "No account found for this number. Sign up as a parent or tutor first." else r.message)
                }
            }
        }
    }
}

data class OtpState(
    val code: String = "",
    val masked: String = "",
    val devOtp: String? = null,
    val secondsLeft: Int = RESEND_SECONDS,
    val loading: Boolean = false,
    val error: String? = null,
    val info: String? = null,
)

private const val RESEND_SECONDS = 30

@HiltViewModel
class OtpViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val auth: AuthRepository,
) : ViewModel() {
    private val route = savedState.toRoute<OtpRoute>()
    private val _state = MutableStateFlow(OtpState(masked = route.masked, devOtp = route.devOtp))
    val state = _state.asStateFlow()

    init { startCountdown() }

    private fun startCountdown() = viewModelScope.launch {
        for (s in RESEND_SECONDS downTo 0) {
            _state.update { it.copy(secondsLeft = s) }
            delay(1000)
        }
    }

    fun onCode(v: String) {
        val digits = v.filter(Char::isDigit).take(6)
        _state.update { it.copy(code = digits, error = null) }
        if (digits.length == 6) verify()
    }

    fun verify() {
        val code = _state.value.code
        if (code.length != 6 || _state.value.loading) return
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            // On success the SessionManager changes and navigation moves to the dashboard automatically.
            when (val r = auth.verifyOtp(route.phone, code)) {
                is ApiResult.Success -> Unit
                is ApiResult.Failure -> _state.update { it.copy(loading = false, error = r.message, code = "") }
            }
        }
    }

    fun resend() {
        if (_state.value.secondsLeft > 0) return
        viewModelScope.launch {
            when (val r = auth.requestLoginOtp(route.phone)) {
                is ApiResult.Success -> {
                    _state.update { it.copy(info = "A new code has been sent to ${r.data.otpSentTo}", devOtp = r.data.devOtp, error = null) }
                    startCountdown()
                }
                is ApiResult.Failure -> _state.update { it.copy(error = r.message) }
            }
        }
    }
}

@Suppress("unused")
private fun OtpSent.toNav(phone: String) = OtpNav(phone, otpSentTo, devOtp)
