import "bootstrap";
import "./bootstrap.scss";
import "./theme_1618041130349.css";
import "@fortawesome/fontawesome-free/js/solid.js";
import "@fortawesome/fontawesome-free/js/brands.js";
import "@fortawesome/fontawesome-free/js/fontawesome.js";
window.$ = window.jQuery = require("jquery");

$(() => {
    $("#download").attr("href", "./index.html");
    $("#upload").attr("href", "./index.html?mode=upload");
});