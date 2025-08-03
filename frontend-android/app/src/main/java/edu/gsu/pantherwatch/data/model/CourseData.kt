package edu.gsu.pantherwatch.data.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class CourseData(
    @field:Json(name = "termDesc")
    val termDesc: String?,
    
    @field:Json(name = "courseReferenceNumber")
    val courseReferenceNumber: String?,
    
    @field:Json(name = "partOfTerm")
    val partOfTerm: String?,
    
    @field:Json(name = "courseNumber")
    val courseNumber: String?,
    
    @field:Json(name = "subject")
    val subject: String?,
    
    @field:Json(name = "subjectDescription")
    val subjectDescription: String?,
    
    @field:Json(name = "sequenceNumber")
    val sequenceNumber: String?,
    
    @field:Json(name = "campusDescription")
    val campusDescription: String?,
    
    @field:Json(name = "scheduleTypeDescription")
    val scheduleTypeDescription: String?,
    
    @field:Json(name = "courseTitle")
    val courseTitle: String?,
    
    @field:Json(name = "creditHours")
    val creditHours: Int,
    
    @field:Json(name = "maximumEnrollment")
    val maximumEnrollment: Int,
    
    @field:Json(name = "enrollment")
    val enrollment: Int,
    
    @field:Json(name = "seatsAvailable")
    val seatsAvailable: Int,
    
    @field:Json(name = "waitCapacity")
    val waitCapacity: Int,
    
    @field:Json(name = "waitAvailable")
    val waitAvailable: Int,
    
    @field:Json(name = "creditHourHigh")
    val creditHourHigh: Int,
    
    @field:Json(name = "creditHourLow")
    val creditHourLow: Int,
    
    @field:Json(name = "linkIdentifier")
    val linkIdentifier: String?,
    
    @field:Json(name = "isSectionLinked")
    val isSectionLinked: Boolean,
    
    @field:Json(name = "subjectCourse")
    val subjectCourse: String?,
    
    @field:Json(name = "faculty")
    val faculty: List<Faculty>,
    
    @field:Json(name = "meetingsFaculty")
    val meetingsFaculty: List<MeetingsFaculty>
)
