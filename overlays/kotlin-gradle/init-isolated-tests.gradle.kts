// Usage: ./gradlew build --init-script overlays/kotlin-gradle/init-isolated-tests.gradle.kts -PagentId=shift1
val agentId = startParameter.projectProperties["agentId"] ?: System.getenv("PI_AGENT_ID") ?: "default"
if (agentId != "default") {
    allprojects {
        tasks.withType<AbstractTestTask>().configureEach {
            binaryResultsDirectory.set(layout.buildDirectory.dir("test-results-$agentId/$name/binary"))
            reports.html.outputLocation.set(layout.buildDirectory.dir("reports/tests-$agentId/$name"))
            reports.junitXml.outputLocation.set(layout.buildDirectory.dir("test-results-$agentId/$name"))
        }
    }
}
