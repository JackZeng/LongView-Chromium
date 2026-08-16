cmake_minimum_required(VERSION 3.20)
project(longview_native LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(longview_segment_model
  src/policy_engine.cc
  src/segment_index.cc
  src/segment_model.cc
  src/telemetry.cc
)
target_include_directories(longview_segment_model PUBLIC include)

add_executable(longview_segment_model_test tests/segment_model_test.cc)
target_link_libraries(longview_segment_model_test PRIVATE longview_segment_model)

add_executable(longview_policy_engine_test tests/policy_engine_test.cc)
target_link_libraries(longview_policy_engine_test PRIVATE longview_segment_model)

add_executable(longview_segment_index_test tests/segment_index_test.cc)
target_link_libraries(longview_segment_index_test PRIVATE longview_segment_model)

enable_testing()
add_test(NAME longview_segment_model_test COMMAND longview_segment_model_test)
add_test(NAME longview_policy_engine_test COMMAND longview_policy_engine_test)
add_test(NAME longview_segment_index_test COMMAND longview_segment_index_test)
