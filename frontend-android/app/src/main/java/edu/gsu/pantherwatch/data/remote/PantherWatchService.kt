package edu.gsu.pantherwatch.data.remote

import edu.gsu.pantherwatch.data.model.RetrieveCourseInfoResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.QueryMap

interface PantherWatchService {
    @GET("api/courses/search")
    suspend fun searchCourses(
        @QueryMap query: Map<String, String>): Response<RetrieveCourseInfoResponse>
}