#!/bin/bash

git archive -o ~/Nextcloud/LessSafe/izarchiv-$(jq -r .version package.json).zip HEAD