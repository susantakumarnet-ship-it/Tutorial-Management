package com.smarttuition.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val Indigo = Color(0xFF2F3E9E)
val IndigoDark = Color(0xFF1E2A78)
val Amber = Color(0xFFF59E0B)
val Success = Color(0xFF15803D)
val SuccessContainer = Color(0xFFDCFCE7)
val Warning = Color(0xFFB45309)
val WarningContainer = Color(0xFFFEF3C7)

private val LightColors = lightColorScheme(
    primary = Indigo,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE0E4FF),
    onPrimaryContainer = IndigoDark,
    secondary = Amber,
    onSecondary = Color(0xFF1F1300),
    secondaryContainer = Color(0xFFFFEDC2),
    onSecondaryContainer = Color(0xFF3D2800),
    tertiary = Color(0xFF0F766E),
    tertiaryContainer = Color(0xFFCCFBF1),
    background = Color(0xFFF7F8FC),
    surface = Color.White,
    surfaceVariant = Color(0xFFEEF0F7),
    onSurfaceVariant = Color(0xFF4A4F63),
    outline = Color(0xFFC5C8D6),
    outlineVariant = Color(0xFFE2E4EE),
    error = Color(0xFFB3261E),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFBAC3FF),
    onPrimary = Color(0xFF0E1A66),
    primaryContainer = Color(0xFF2F3E9E),
    onPrimaryContainer = Color(0xFFE0E4FF),
    secondary = Color(0xFFFFC857),
    onSecondary = Color(0xFF3D2800),
    secondaryContainer = Color(0xFF5C3F00),
    tertiary = Color(0xFF5EEAD4),
    background = Color(0xFF111318),
    surface = Color(0xFF181B22),
    surfaceVariant = Color(0xFF262A35),
    onSurfaceVariant = Color(0xFFC5C8D6),
    outline = Color(0xFF5A5F72),
    outlineVariant = Color(0xFF33384A),
)

private val AppTypography = Typography(
    headlineLarge = TextStyle(fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.Bold),
    headlineMedium = TextStyle(fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.Bold),
    headlineSmall = TextStyle(fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold),
    titleLarge = TextStyle(fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold),
)

private val AppShapes = Shapes(
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(20.dp),
)

@Composable
fun SmartTuitionTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = AppTypography,
        shapes = AppShapes,
        content = content,
    )
}
