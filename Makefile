.PHONY: validate manifest test-js test-python test-native doctor install-overlay native-probe

validate: manifest test-js test-python test-native
	python3 tools/validate_repository.py

manifest:
	python3 tools/generate_source_manifest.py

test-js:
	npm run check:js
	npm test

test-python:
	PYTHONPATH=tools python3 -m unittest discover -s tools/tests -v
	python3 -m compileall -q tools

test-native:
	cmake -S src/native -B build/native -DCMAKE_BUILD_TYPE=Release
	cmake --build build/native --config Release --parallel 2
	ctest --test-dir build/native -C Release --output-on-failure

doctor:
	python3 tools/longview.py doctor

install-overlay:
	python3 tools/longview.py install-overlay --force

native-probe:
	python3 tools/longview.py native-probe --force
