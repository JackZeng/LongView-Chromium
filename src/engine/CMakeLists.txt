cmake_minimum_required(VERSION 3.20)
project(longview_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(longview_engine STATIC
  src/cold_backend.cc
  src/geometry_capsule.cc
  src/long_page_controller.cc
  src/scheduler.cc
)
target_include_directories(longview_engine PUBLIC include)
if(MSVC)
  target_compile_options(longview_engine PRIVATE /W4 /WX)
else()
  target_compile_options(longview_engine PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()

add_executable(longview_engine_test tests/engine_test.cc)
target_link_libraries(longview_engine_test PRIVATE longview_engine)
if(MSVC)
  target_compile_options(longview_engine_test PRIVATE /W4 /WX)
else()
  target_compile_options(longview_engine_test PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()

enable_testing()
add_test(NAME longview_engine_test COMMAND longview_engine_test)
