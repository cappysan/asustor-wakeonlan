#!/usr/bin/env sh
# SPDX-License-Identifier: MIT
#
# ------------------------------------------------------------------------------
# Save variables
APKG_PKG_DIR=/usr/local/AppCentral/${APKG_PKG_NAME}
APKG_PKG_SHORT_VER="${APKG_PKG_VER%-*}"
APKG_CFG_DIR=/share/Configuration/wakeonlan
export APKG_CFG_DIR APKG_PKG_VER APKG_PKG_SHORT_VER
env | grep APKG | grep -v APKG_PKG_STATUS \
  | grep -v " " | sort > ${APKG_PKG_DIR}/.env.install
# ------------------------------------------------------------------------------

cd ${APKG_PKG_DIR:-/nonexistent} || exit 1
if test -f ${APKG_PKG_DIR}/env; then
  . ${APKG_PKG_DIR}/env
fi

# Permissions
# ===========
# Ensure permissions are limited to root user for the application folder.
chown -R root:root ${APKG_PKG_DIR}


# Configuration folder
# ====================
mkdir -p ${APKG_CFG_DIR}
chown -R ${APKG_USER}:${APKG_GROUP} ${APKG_CFG_DIR}
chmod 750 ${APKG_CFG_DIR}


# Configuration
# =============
# Don't override files that could have been user modified.
rsync -a --inplace --ignore-existing ${APKG_PKG_DIR}/conf.dist/ ${APKG_CFG_DIR}
chown -R ${APKG_USER}:${APKG_GROUP} ${APKG_CFG_DIR}

logger "[${WHAT}] Application installed."

# ------------------------------------------------------------------------------
exit 0
