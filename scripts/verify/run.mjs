#!/usr/bin/env node

import { cli } from './jobs.mjs'

process.exitCode = await cli(process.argv.slice(2))
