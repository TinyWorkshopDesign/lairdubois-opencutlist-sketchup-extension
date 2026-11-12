# -------------------------------------------------------------------
#                             Packy

if(OCL_WASM)
  # By default the WebAssembly module is single-threaded: no pthreads, no
  # SharedArrayBuffer, so it loads in any Worker or page, cross-origin
  # isolated or not. c_optimize_start then computes the run before it returns
  # (see PACKY_SINGLE_THREAD), and a host runs several modules in parallel
  # Workers instead.
  # OCL_WASM_PTHREADS=ON builds the threaded module: the solver runs on its
  # own thread (std::async), so the whole Packy tree, PackingSolver included,
  # is built with pthreads and needs SharedArrayBuffer.
  option(OCL_WASM_PTHREADS "Build Packy's WebAssembly module with pthreads" OFF)
  if(OCL_WASM_PTHREADS)
    add_compile_options(-pthread)
    add_link_options(-pthread)
  else()
    add_compile_definitions(PACKY_SINGLE_THREAD)
  endif()
endif()

# -------------------------------------------------------------------
#                             extern

add_subdirectory(extern)

# -------------------------------------------------------------------

if(WIN32)
  add_compile_definitions(LIBPACKY_EXPORTS)
else()
  add_compile_options(-fPIC)
endif()

# Library headers
set(LIBRARY_HEADERS
        include/shape/labeling.hpp
        include/packy.hpp
        src/solver.hpp
        src/solver_builder.hpp
)
source_group("Headers" FILES ${LIBRARY_HEADERS})

# Library sources
if(WIN32)
  set(LIBRARY_SOURCES
          src/labeling.cpp
          src/packy.cpp
          src/dllmain.cpp
  )
else()
  set(LIBRARY_SOURCES
          src/labeling.cpp
          src/packy.cpp
  )
endif()
source_group("Sources" FILES ${LIBRARY_SOURCES})

if(WIN32)
  include(GenerateExportHeader)
endif()

add_library(Packy SHARED ${LIBRARY_HEADERS} ${LIBRARY_SOURCES})

if(WIN32)
  generate_export_header(Packy
          BASE_NAME Packy
          EXPORT_MACRO_NAME Packy_EXPORT
          EXPORT_FILE_NAME Packy_Export.h
          STATIC_DEFINE Packy_BUILT_AS_STATIC
  )
endif()

target_include_directories(Packy PUBLIC include)
target_link_libraries(Packy PRIVATE PackingSolver::onedimensional)
target_link_libraries(Packy PRIVATE PackingSolver::rectangle)
target_link_libraries(Packy PRIVATE PackingSolver::rectangleguillotine)
target_link_libraries(Packy PRIVATE PackingSolver::irregular)
target_compile_features(Packy PRIVATE cxx_std_17)

install(TARGETS Packy RUNTIME DESTINATION lib)

# -------------------------------------------------------------------
#                       WebAssembly module

if(OCL_WASM)

  # packy.js (ES module factory: createPacky) + packy.wasm.
  # With OCL_WASM_PTHREADS it needs SharedArrayBuffer, so a browser host must
  # be cross-origin isolated.
  add_executable(PackyWasm ${LIBRARY_HEADERS} ${LIBRARY_SOURCES})
  set_target_properties(PackyWasm PROPERTIES OUTPUT_NAME packy SUFFIX ".js")
  target_include_directories(PackyWasm PUBLIC include)
  target_link_libraries(PackyWasm PUBLIC PackingSolver::onedimensional)
  target_link_libraries(PackyWasm PUBLIC PackingSolver::rectangle)
  target_link_libraries(PackyWasm PUBLIC PackingSolver::rectangleguillotine)
  target_link_libraries(PackyWasm PUBLIC PackingSolver::irregular)
  target_compile_features(PackyWasm PRIVATE cxx_std_17)
  if(OCL_WASM_PTHREADS)
    # mimalloc only pays off with threads (dlmalloc takes one global lock)
    target_link_options(PackyWasm PRIVATE -sPTHREAD_POOL_SIZE=4 -sMALLOC=mimalloc)
  endif()
  target_link_options(PackyWasm PRIVATE
          --no-entry
          -sMODULARIZE=1
          -sEXPORT_ES6=1
          -sEXPORT_NAME=createPacky
          -sENVIRONMENT=web,worker,node
          -sALLOW_MEMORY_GROWTH=1
          -sSTACK_SIZE=1MB
          -sEXPORTED_FUNCTIONS=_c_optimize_start,_c_optimize_advance,_c_optimize_cancel,_c_optimize_cancel_all,_c_version,_malloc,_free
          -sEXPORTED_RUNTIME_METHODS=UTF8ToString,stringToNewUTF8
  )

  install(TARGETS PackyWasm RUNTIME DESTINATION .)
  install(FILES $<TARGET_FILE_DIR:PackyWasm>/packy.wasm DESTINATION .)

endif()

# -------------------------------------------------------------------
#                           Debug executable

if(OCL_BUILD_MAIN)

  add_executable(PackyMain ${LIBRARY_HEADERS} ${LIBRARY_SOURCES} src/main.cpp)
  target_include_directories(PackyMain PUBLIC include)
  target_link_libraries(PackyMain PRIVATE PackingSolver::onedimensional)
  target_link_libraries(PackyMain PRIVATE PackingSolver::rectangle)
  target_link_libraries(PackyMain PRIVATE PackingSolver::rectangleguillotine)
  target_link_libraries(PackyMain PRIVATE PackingSolver::irregular)
  target_link_libraries(PackyMain PRIVATE Boost::program_options)
  target_compile_features(PackyMain PRIVATE cxx_std_17)

  install(TARGETS PackyMain RUNTIME DESTINATION lib)

endif()
