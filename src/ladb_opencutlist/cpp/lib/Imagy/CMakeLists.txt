# -------------------------------------------------------------------
#                             Imagy

if(WIN32)
  add_compile_definitions(LIBIMAGY_EXPORTS)
else()
  add_compile_options(-fPIC)
endif()

# Library headers
set(LIBRARY_HEADERS
        include/imagy.hpp
        include/imagy.image.hpp
        include/stb_image.hpp
        include/stb_image_write.hpp
)
source_group("Headers" FILES ${LIBRARY_HEADERS})

# Library sources
if(WIN32)
  set(LIBRARY_SOURCES
          src/imagy.cpp
          src/imagy.image.cpp
          src/dllmain.cpp
  )
else()
  set(LIBRARY_SOURCES
          src/imagy.cpp
          src/imagy.image.cpp
  )
endif()
source_group("Sources" FILES ${LIBRARY_SOURCES})

if(WIN32)
  include(GenerateExportHeader)
endif()

add_library(Imagy SHARED ${LIBRARY_HEADERS} ${LIBRARY_SOURCES})

if(WIN32)
  generate_export_header(Imagy
          BASE_NAME Imagy
          EXPORT_MACRO_NAME Imagy_EXPORT
          EXPORT_FILE_NAME Imagy_Export.h
          STATIC_DEFINE Imagy_BUILT_AS_STATIC
  )
endif()

target_include_directories(Imagy PUBLIC include)
target_compile_features(Imagy PRIVATE cxx_std_17)

install(TARGETS Imagy RUNTIME DESTINATION lib)

# -------------------------------------------------------------------
#                       WebAssembly module

if(OCL_WASM)

  # imagy.js (ES module factory: createImagy) + imagy.wasm.
  # c_load/c_write take file names: from JS, put the image bytes in the
  # module's in-memory file system (Module.FS) and read the result back.
  add_executable(ImagyWasm ${LIBRARY_HEADERS} ${LIBRARY_SOURCES})
  set_target_properties(ImagyWasm PROPERTIES OUTPUT_NAME imagy SUFFIX ".js")
  target_include_directories(ImagyWasm PUBLIC include)
  target_compile_features(ImagyWasm PRIVATE cxx_std_17)
  target_link_options(ImagyWasm PRIVATE
          --no-entry
          -sMODULARIZE=1
          -sEXPORT_ES6=1
          -sEXPORT_NAME=createImagy
          -sENVIRONMENT=web,worker,node
          -sALLOW_MEMORY_GROWTH=1
          -sFORCE_FILESYSTEM=1
          -sEXPORTED_FUNCTIONS=_c_clear,_c_load,_c_write,_c_get_width,_c_get_height,_c_get_channels,_c_flip_horizontal,_c_flip_vertical,_c_rotate,_c_version,_malloc,_free
          -sEXPORTED_RUNTIME_METHODS=FS,UTF8ToString,stringToNewUTF8
  )

  install(TARGETS ImagyWasm RUNTIME DESTINATION .)
  install(FILES $<TARGET_FILE_DIR:ImagyWasm>/imagy.wasm DESTINATION .)

endif()