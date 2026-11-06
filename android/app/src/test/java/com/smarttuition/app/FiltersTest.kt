package com.smarttuition.app

import com.smarttuition.app.core.util.Validators
import com.smarttuition.app.core.util.rupees
import com.smarttuition.app.data.model.Board
import com.smarttuition.app.data.model.IdName
import com.smarttuition.app.feature.parent.TutorFilters
import com.smarttuition.app.feature.tutor.StudentFilters
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class FiltersTest {

    @Test
    fun `tutor filters use coordinates over city when both are set`() {
        val q = TutorFilters(lat = 12.97, lng = 77.64, city = "Bengaluru", radiusKm = 5).toQuery(page = 2)
        assertEquals("12.97", q["lat"])
        assertEquals("5", q["radiusKm"])
        assertEquals("2", q["page"])
        assertFalse(q.containsKey("city"))
    }

    @Test
    fun `tutor filters include only selected criteria`() {
        val q = TutorFilters(
            classItem = IdName(13, "Class 10"),
            subject = IdName(2, "Mathematics"),
            board = Board(1, "CBSE board", "CBSE"),
            mode = "OFFLINE",
            gender = "FEMALE",
            maxFee = "5000",
            minExperience = 3,
            dayOfWeek = 1,
            city = "Pune",
            pincode = "4110",          // incomplete pincode is ignored
        ).toQuery(1)
        assertEquals("13", q["classId"])
        assertEquals("2", q["subjectId"])
        assertEquals("1", q["boardId"])
        assertEquals("OFFLINE", q["mode"])
        assertEquals("5000", q["maxFee"])
        assertEquals("3", q["minExperience"])
        assertEquals("Pune", q["city"])
        assertNull(q["pincode"])
        assertNull(q["q"])
        assertEquals(8, TutorFilters(classItem = IdName(1, "x"), subject = IdName(1, "y"), board = Board(1, "b", "B"), mode = "ONLINE", gender = "MALE", minExperience = 1, dayOfWeek = 2, maxFee = "1").activeCount)
    }

    @Test
    fun `student filters default to matching the tutor profile`() {
        val q = StudentFilters().toQuery(1)
        assertEquals("true", q["matchProfile"])
        assertNull(q["radiusKm"])
        assertEquals("25", StudentFilters(radiusKm = 25, matchProfile = false).toQuery(1)["radiusKm"])
        assertNull(StudentFilters(matchProfile = false).toQuery(1)["matchProfile"])
    }

    @Test
    fun validators() {
        assertNull(Validators.phone("9876543210"))
        assertNotNull(Validators.phone("1234567890"))
        assertNotNull(Validators.phone("98765"))
        assertNull(Validators.email("a.b@school.in"))
        assertNotNull(Validators.email("not-an-email"))
        assertNull(Validators.pincode("560038"))
        assertNotNull(Validators.pincode("060038"))
    }

    @Test
    fun `rupee formatting uses Indian grouping`() {
        assertEquals("₹1,50,000", rupees(150000))
        assertEquals("—", rupees(null))
        assertEquals("₹999", rupees(999))
        assertEquals("₹4,500", rupees(4500))
        assertEquals("₹12,34,56,789", rupees(123456789))
    }
}
