# SPDX-License-Identifier: MIT
#
.PHONY: all apk

all: apk

apk: ## build the apk package
	support/apkg.py apk
	realpath cappysan-*.apk
