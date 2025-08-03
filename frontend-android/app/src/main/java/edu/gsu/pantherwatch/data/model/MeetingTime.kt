package edu.gsu.pantherwatch.data.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class MeetingTime(
    @field:Json(name = "beginTime")
    val beginTime: String?,
    
    @field:Json(name = "buildingDescription")
    val buildingDescription: String?,
    
    @field:Json(name = "campusDescription")
    val campusDescription: String?,
    
    @field:Json(name = "category")
    val category: String?,
    
    @field:Json(name = "endDate")
    val endDate: String?,
    
    @field:Json(name = "endTime")
    val endTime: String?,
    
    @field:Json(name = "friday")
    val friday: Boolean,
    
    @field:Json(name = "hoursWeek")
    val hoursWeek: Int,
    
    @field:Json(name = "meetingTypeDescription")
    val meetingTypeDescription: String?,
    
    @field:Json(name = "monday")
    val monday: Boolean,
    
    @field:Json(name = "room")
    val room: String?,
    
    @field:Json(name = "saturday")
    val saturday: Boolean,
    
    @field:Json(name = "startDate")
    val startDate: String?,
    
    @field:Json(name = "sunday")
    val sunday: Boolean,
    
    @field:Json(name = "thursday")
    val thursday: Boolean,
    
    @field:Json(name = "tuesday")
    val tuesday: Boolean,
    
    @field:Json(name = "wednesday")
    val wednesday: Boolean
)
