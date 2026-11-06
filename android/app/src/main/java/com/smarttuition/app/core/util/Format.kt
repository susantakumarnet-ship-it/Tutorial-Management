package com.smarttuition.app.core.util

import com.smarttuition.app.BuildConfig
import java.time.Duration
import java.time.Instant

/** Indian digit grouping (1,50,000) without depending on the device's locale data. */
fun indianGrouping(value: Int): String {
    val digits = kotlin.math.abs(value.toLong()).toString()
    val sign = if (value < 0) "-" else ""
    if (digits.length <= 3) return sign + digits
    val last3 = digits.takeLast(3)
    val rest = digits.dropLast(3).reversed().chunked(2).joinToString(",").reversed()
    return "$sign$rest,$last3"
}

fun rupees(amount: Int?): String = if (amount == null) "—" else "₹${indianGrouping(amount)}"
fun perMonth(amount: Int?): String = if (amount == null) "Fee on request" else "${rupees(amount)}/month"

val DAY_NAMES = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

/** Server photo URLs are relative ("/api/v1/files/..."); resolve them against the API host. */
fun absoluteUrl(path: String?): String? {
    if (path.isNullOrBlank()) return null
    if (path.startsWith("http")) return path
    val origin = BuildConfig.API_BASE_URL.substringBefore("/api/")
    return origin + path
}

fun initials(name: String): String =
    name.split(" ").filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }

fun modeLabel(mode: String): String = when (mode) {
    "ONLINE" -> "Online"
    "OFFLINE" -> "Home tuition"
    "HOME" -> "Home tuition"
    "BOTH", "EITHER" -> "Online & Home"
    else -> mode
}

fun statusLabel(status: String): String = status.lowercase().replace('_', ' ').replaceFirstChar { it.uppercase() }

/** "5 min ago", "3 h ago", "2 d ago" from an ISO-8601 timestamp. */
fun timeAgo(iso: String): String {
    val then = runCatching { Instant.parse(iso) }.getOrNull() ?: return ""
    val d = Duration.between(then, Instant.now())
    return when {
        d.toMinutes() < 1 -> "just now"
        d.toMinutes() < 60 -> "${d.toMinutes()} min ago"
        d.toHours() < 24 -> "${d.toHours()} h ago"
        d.toDays() < 30 -> "${d.toDays()} d ago"
        else -> "${d.toDays() / 30} mo ago"
    }
}

object Validators {
    private val phoneRegex = Regex("^[6-9]\\d{9}$")
    private val emailRegex = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")
    private val pincodeRegex = Regex("^[1-9]\\d{5}$")

    fun phone(v: String): String? = if (phoneRegex.matches(v.trim())) null else "Enter a valid 10-digit mobile number"
    fun email(v: String): String? = if (emailRegex.matches(v.trim())) null else "Enter a valid email address"
    fun name(v: String): String? = if (v.trim().length >= 2) null else "Enter your full name"
    fun pincode(v: String): String? = if (pincodeRegex.matches(v.trim())) null else "Enter a valid 6-digit pincode"
}
