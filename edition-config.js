/* =========================================================
   edition-config.js — which edition of Summitide Learning this copy is.
     web       the school's own site (this file as it sits in the repository): nothing below changes.
     schools   the store app for schools and boards: asks for a school code at first launch; no prices, nothing to buy.
     personal  the store app for a family or a single teacher: everything stays on the device; courses are bought in the app.
   tools/build-editions.js writes this file into each store build. Do not edit it by hand in a build.
   ========================================================= */
window.EDITION = { id: 'web' };
