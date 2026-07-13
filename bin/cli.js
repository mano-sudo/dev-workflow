#!/usr/bin/env node
"use strict";

require("../dist/index")
  .main(process.argv.slice(2))
  .catch((e) => {
    console.error(e && e.message ? e.message : e);
    process.exit(1);
  });
