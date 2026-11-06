package com.smarttuition.app.ui.components

import androidx.compose.runtime.Composable
import com.smarttuition.app.core.network.ApiResult

/** Screen-level load state. */
sealed interface Ui<out T> {
    data object Loading : Ui<Nothing>
    data class Error(val message: String) : Ui<Nothing>
    data class Data<T>(val value: T) : Ui<T>
}

fun <T> ApiResult<T>.toUi(): Ui<T> = when (this) {
    is ApiResult.Success -> Ui.Data(data)
    is ApiResult.Failure -> Ui.Error(message)
}

/** Renders loading / error / content for a [Ui] value. */
@Composable
fun <T> UiContent(state: Ui<T>, onRetry: () -> Unit, content: @Composable (T) -> Unit) {
    when (state) {
        Ui.Loading -> LoadingBox()
        is Ui.Error -> ErrorBox(state.message, onRetry)
        is Ui.Data -> content(state.value)
    }
}
