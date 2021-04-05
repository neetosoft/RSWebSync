import "bootstrap";
import "./bootstrap.scss";
import Dropzone from "dropzone";
import "dropzone/dist/dropzone.css";
import "@fortawesome/fontawesome-free/js/solid.js";
import "@fortawesome/fontawesome-free/js/fontawesome.js";
window.$ = window.jQuery = require("jquery");
import "gasparesganga-jquery-loading-overlay";
var { isText } = require("istextorbinary");
import "jquery.fancytree/dist/modules/jquery.fancytree.ui-deps.js";
import "jquery.fancytree/dist/modules/jquery.fancytree.js";
import "jquery.fancytree/dist/skin-win8/ui.fancytree.css";
import JSZip from "jszip";
import saveAs from "jszip/vendor/FileSaver.js";
import ko from "knockout";
import _ from "lodash";
import toastr from "toastr";
import "toastr/build/toastr.css";
import url from "url";
import { Configuration } from "./ssrs/configuration";
import { CatalogItem, CatalogItemType, CatalogItemsApiFactory, MeApiFactory } from "./ssrs/api";

//call as early as possible
Dropzone.autoDiscover = false;

/**
 * The Knockout view model to control the page.
 */
var vm = window.vm = {
    cache: {},
    validUrl: "",
    url: ko.observable(""),
    user: ko.observable({}),
    mode: ko.observable("download"),
    includeRootFolder: ko.observable(false),
    reUploadErrorOnly: ko.observable(false),
    downloadFileName: ko.observable("RSWebSync"),
    sourceTree: () => $.ui.fancytree.getTree("#srcTree"),
    targetTree: () => $.ui.fancytree.getTree("#destTree"),
    queryUrl: (url.parse(window.location.href, true).query || {}).url || "",
    remoteTreeId: () => ko.computed(() => vm.mode() == "upload" ? "#destTree" : "#srcTree", vm),

    /**
     * Initialize the view model, dropzone and fancytree.
     */
    init: () => {
        $("#dropzone").addClass("dropzone");
        vm.dropzone = new Dropzone("#dropzone", {
            autoProcessQueue: false, accept: vm.loadLocal, createImageThumbnails: false, maxFilesize: null,
            parallelUploads: 1, previewTemplate: $("#dzTemplate").html().trim(), processing: vm.upload, url: "#",
            init: function () { this.hiddenFileInput.setAttribute("webkitdirectory", true); },
            queuecomplete: () => vm.dropzone.options.autoProcessQueue = false
        });
        vm.dropzone.submitRequest = function (_, __, files) { this._finished(files, "locally resolved"); }

        vm.remoteTreeId = vm.remoteTreeId();
        $("#srcTree").fancytree({ source: [], checkbox: true, selectMode: 3 });
        $("#destTree").fancytree({ source: [], checkbox: true, selectMode: 1 });

        ko.applyBindings(vm);
        vm.setMode("download");
    },

    /**
     * Toggle between Upload and Download mode.
     * @param {string} mode - The upload or download mode.
     */
    setMode: (mode) => {
        vm.clear();
        vm.mode(mode);

        if (mode == "upload")
            vm.dropzone.enable();
        else
            vm.dropzone.disable();

        vm.url(vm.validUrl || vm.queryUrl || "http://localhost/reports");
    },

    /**
     * Clear the user, url, dropzone, fancytrees, and toast.
     */
    clear: () => {
        vm.url("");
        vm.user({});
        vm.cache = {};
        toastr.remove();
        vm.sourceTree().clear();
        vm.targetTree().clear();
        vm.dropzone.removeAllFiles(true);
    },

    /**
     * Load the relevant (folder, report, dataset, and mobile report) catalog items from SSRS staring from the url.
     * @returns {void}
     */
    loadRemotes: () => {
        $(vm.remoteTreeId()).LoadingOverlay("show");
        if (!vm.url().trim()) vm.setMode(vm.mode());
        var { cfg, opt, urls } = vm.getApiContexts();
        var flt = `startswith(Path, '${urls.length == 1 ? "/" : `/${urls[1]}`}') and (Type eq Model.CatalogItemType'Folder'${vm.mode() == "upload"
            ? ""
            : " or Type eq Model.CatalogItemType'Report' or Type eq Model.CatalogItemType'DataSet'"
            + " or Type eq Model.CatalogItemType'MobileReport' or Type eq Model.CatalogItemType'Resource'"})`;
        MeApiFactory(cfg, fetch, cfg.basePath).getUserDetails(opt).then(usr =>
            vm.user(usr), vm.restCallback);
        CatalogItemsApiFactory(cfg, fetch, cfg.basePath).getCatalogItems(2147483647, 0, flt, false, "Path", "*", opt)
            .then(json => {
                vm.cache = {};
                vm.validUrl = vm.url().trim();

                for (var item of json.value) {
                    if (item.Type == CatalogItemType.Folder) vm.cache[item.Path] = item;
                    var node = $.ui.fancytree.getTree(vm.remoteTreeId()).rootNode;
                    if (!!node && !!node.children && !!node.children.length && node.children[0].title == "No data.") node.tree.clear();
                    var parent = node.findFirst(_node => _node.key == item.ParentFolderId);
                    var child = node.findFirst(_node => _node.key == item.Id);
                    if (!child) node = (parent || node).addNode({
                        folder: item.Type == CatalogItemType.Folder, key: item.Id, path: item.Path, itemType: item.Type,
                        title: `${item.Name}${vm.mode() == "upload" || item.Type == CatalogItemType.Folder ? "" : ` (${item.Type})`}`
                    });

                    node.tree.expandAll();
                }
                toastr.success(`${vm.url()} loaded`);
            }, vm.restCallback).finally(() => $(vm.remoteTreeId()).LoadingOverlay("hide"));
    },

    /**
     * Get the objects required to make the SSRS REST API call.
     * @returns {{ cfg: Configuration, opt: any, urls: string[]}} - Returns the objects required to make the SSRS REST API call. 
     */
    getApiContexts() {
        var urls = vm.url().trim().split("/browse/");
        urls = _(urls).map(url => url.trim()).filter(url => !!url).value();
        var cfg = new Configuration({ basePath: `${urls[0]}/api/v2.0` });
        var opt = { mode: "cors", credentials: "include", origin: location.origin };
        return { cfg, opt, urls };
    },

    /**
     * Load folder dragged and dropped in the dropzone to the Source tree.
     * @param {Dropzone.DropzoneFile} file - The dropzone file to be accepted.
     * @param {(error?: string | Error => void)} done - The accept callback, call with null or "" for done, otherwise for fail.
     * @returns {void}
     */
    loadLocal: (file, done) => {
        done();
        var node = vm.sourceTree().rootNode;
        var paths = file.fullPath.split("/");
        $(file.previewElement).find(".dz-fullpath").text(file.fullPath);
        if (!!node && !!node.children && !!node.children.length && node.children[0].title == "No data.") node.tree.clear();

        for (var path of paths) {
            var child = node.findFirst(_node => _node.parent == node && _node.title == path);
            node = !child ? node.addNode({ title: path, folder: path != _.last(paths) }) : child;
            if (!node.folder) file.fancyTreeNode = node;
        }

        node.tree.expandAll();
    },

    /**
     * Validate the inputs and run the action relevant to the selected mode. 
     * @returns {void}
     */
    run: () => {
        var err = false;
        toastr.remove();
        toastr.options.newestOnTop = false;

        if (!vm.url().trim()) {
            err = true;
            toastr.error("SSRS Web Portal URL is required");
        }

        if (!vm.sourceTree().getSelectedNodes().length) {
            err = true;
            toastr.error("Source item(s) is (are) required");
        }

        if (vm.mode() == "upload" && !vm.targetTree().getSelectedNodes().length) {
            err = true;
            toastr.error("Destination folder is required");
        }

        toastr.options.newestOnTop = true;
        if (!!err) return;

        if (vm.mode() != "upload")
            vm.download(); else {
            for (var file of vm.dropzone.files)
                file.status = vm.reUploadErrorOnly() && file.status != Dropzone.ERROR ? file.status : Dropzone.QUEUED;

            vm.dropzone.options.autoProcessQueue = true;
            vm.dropzone.processQueue();
            $("#dropzone").tooltip("dispose").tooltip({
                html: true, sanitize: false, selector: ".file-row", title: function () {
                    return $(this).find(".dz-full-message").html();
                }
            });
        }
    },

    /**
     * 
     */
    download: () => {
        var zip = new JSZip();
        vm.cache[""] = vm.cache["/"] = zip;
        var { cfg, opt } = vm.getApiContexts();
        $(vm.remoteTreeId()).LoadingOverlay("show");
        var dict = { [CatalogItemType.Report]: ".rdl", [CatalogItemType.DataSet]: ".rsd", [CatalogItemType.MobileReport]: ".rsmobile" };
        var nodes = _(vm.sourceTree().getSelectedNodes()).filter(sn => (sn.data.path || "/") != "/")
            .orderBy([(sn => sn.data.path.split("/").length)], ["asc"]).value();
        nodes.reduce((promise, node) => {
            return promise.then(() => {
                var paths = node.data.path.split("/");
                var name = `${_.last(paths)}${dict[node.data.itemType] || ""}`;
                var isTxt = !name.endsWith(".rsmobile") && (!!dict[node.data.itemType] || isText(name));
                return node.folder
                    ? Promise.resolve(vm.cache[node.data.path] = vm.cache[`${_.initial(paths).join("/")}`].folder(_.last(paths)))
                    : CatalogItemsApiFactory(cfg, fetch, cfg.basePath).getCatalogItemContent(node.key, opt).then(response =>
                        isTxt ? response.text() : response.blob(), vm.restCallback).then(content =>
                            isTxt ? Promise.resolve(vm.cache[`${_.initial(paths).join("/")}`].file(name, content))
                                : new Promise((resolve, reject) => {
                                    var reader = new FileReader();
                                    reader.onerror = () => reject(reader.error);
                                    reader.onload = () => {
                                        var base64 = reader.result.replace("data:", "").replace(/^.+,/, "");
                                        resolve(vm.cache[`${_.initial(paths).join("/")}`].file(name, base64, { base64: true }));
                                    };
                                    reader.readAsDataURL(content);
                                }), vm.restCallback);
            }, vm.restCallback).finally(() => {
                if (node == _.last(nodes))
                    zip.generateAsync({ type: "blob" }).then(blob => saveAs(blob, vm.downloadFileName().trim() || "RSWebSync"))
                        .finally(() => $(vm.remoteTreeId()).LoadingOverlay("hide"));
            });
        }, Promise.resolve());
    },

    /**
     * Process each of the dropzone file to upload to SSRS. 
     * @param {Dropzone.DropzoneFile} file - The dropzone file to be processed.
     */
    upload: file => {
        $(file.previewElement).find(".dz-full-message, .dz-error-message").html("");
        if (!file.fancyTreeNode.selected) return vm.restCallback({ url: file.fullPath, status: 400, statusText: "Not selected in Source" }, file);
        var { cfg, opt } = vm.getApiContexts();
        $(file.previewElement).find(".dz-status").html($("#dzSpinner").html());
        var paths = _.drop(file.fullPath.split("/"), vm.includeRootFolder() ? 0 : 1);
        var map = { ["rdl"]: CatalogItemType.Report, ["rsd"]: CatalogItemType.DataSet, ["rsmobile"]: CatalogItemType.MobileReport };
        var reader = new FileReader();
        reader.onerror = () => toastr.error(reader.error);
        reader.onload = () => {
            var content = reader.result.replace("data:", "").replace(/^.+,/, "");
            paths.reduce((promise, path) => {
                return promise.then(parent => {
                    var fullPath = `${parent.Path == "/" ? "" : parent.Path}/${path != _.last(paths) || !map[_.last(path.split("."))]
                        ? path : path.replace(`.${_.last(path.split("."))}`, "")}`;
                    return (!!vm.cache[fullPath]
                        ? Promise.resolve({ value: [vm.cache[fullPath]] })
                        : CatalogItemsApiFactory(cfg, fetch, cfg.basePath).getCatalogItems(2147483647, 0, `Path eq '${fullPath}'`, false, "Path", "*", opt))
                        .then(items => {
                            var [name, item] = [_.last(fullPath.split("/")), _.head((items || {}).value || [])];
                            var type = path != _.last(paths) ? CatalogItemType.Folder : (map[_.last(path.split("."))] || CatalogItemType.Resource);

                            if (!item) {
                                if (path != _.last(paths))
                                    return CatalogItemsApiFactory(cfg, fetch, cfg.basePath).addCatalogItem({
                                        Name: name, Path: fullPath, Type: type, "@odata.type": `#Model.${type}`
                                    }, opt).then(_item =>
                                        vm.restCallback((vm.cache[fullPath] = _item), file, path, "added"));
                                else
                                    return CatalogItemsApiFactory(cfg, fetch, cfg.basePath).addCatalogItem({
                                        Name: name, Path: fullPath, Type: type, Content: content, "@odata.type": `#Model.${type}`
                                    }, opt).then(_item =>
                                        vm.restCallback(_item, file, path, "added"));
                            } else {
                                if (path != _.last(paths))
                                    return Promise.resolve(item).then(_item =>
                                        vm.restCallback((vm.cache[fullPath] = _item), file, path, "exists"));
                                else
                                    return CatalogItemsApiFactory(cfg, fetch, cfg.basePath).updateCatalogItem(item.Id, {
                                        Name: name, Path: fullPath, Type: type, Content: content, "@odata.type": `#Model.${type}`
                                    }, Object.assign({}, opt, { method: "PUT" })).then(_item =>
                                        vm.restCallback(_item, file, path, "updated"));
                            }
                        }, () => { });
                }, response => vm.restCallback(response, file, path));
            }, Promise.resolve(vm.cache[vm.targetTree().getSelectedNodes()[0].data.path]));
        };
        reader.readAsDataURL(file);
    },

    /**
     * The rejected reason type definition.
     * @typedef {Object} RejectedReason
     * @property {string} message - The error message.
     * @property {string} stack - The error stack trace.
     */

    /**
     * Callback handler for SSRS REST API call with catalog item, reason or response object.
     * @param {CatalogItem | RejectedReason | Response} response - The catalog item, reason, or response object. 
     * @param {Dropzone.DropzoneFile} file - The file object. 
     * @param {String} path - The path string. 
     * @param {String} action - The action string. 
     */
    restCallback: (response, file, path, action) => {
        if (!file) {
            if (!!response.status) {
                if (response.status >= 200 && response.status < 300)
                    toastr.success(`${response.url} done with ${response.status}: ${response.statusText}`);
                else
                    toastr.error(`${response.url} fail with ${response.status}: ${response.statusText}`);
            } else {
                var div = $("<div/>").html(response.stack);
                var isText = (toastr.options.escapeHtml = div.html() == div.text());
                toastr.error(`${!response.url ? "" : `${response.url} fail with `}${response.message}${isText ? ": " : "<br/>"}${response.stack}`);
            }
        }
        else {
            var dzFullMsg = $(file.previewElement).find(".dz-full-message");
            var dzLastMsg = $(file.previewElement).find(".dz-error-message");

            if (path == _.last(file.fullPath.split("/"))) {
                file.status = !!response.Id || (!!response.status && response.status >= 200 && response.status < 300) ? Dropzone.SUCCESS : Dropzone.ERROR;
                $(file.previewElement).find(".dz-status").html(file.status == Dropzone.SUCCESS ? $("#dzSuccess").html() : $("#dzError").html());
                $(file.previewElement).toggleClass("dz-success", file.status == Dropzone.SUCCESS).toggleClass("dz-error", file.status == Dropzone.ERROR);
            }

            if (!!response.Id)
                dzLastMsg.html(`<div class='text-success'>${!path ? "" : `${path}=> `}${response.Type}: ${action}</div>`);
            else if (!!response.status)
                dzLastMsg.html(`<div class='text-${response.status >= 200 && response.status < 300 ? "success" : "danger"}'>` +
                    `${!path ? "" : `${path}=> `}${response.status}: ${response.statusText}</div>`);
            else
                dzLastMsg.html(`<div class='text-danger'>${!path ? "" : `${path}=> `}${response.message}: ${response.stack}</div>`);

            dzFullMsg.html(`${!dzFullMsg.html() ? "" : `${dzFullMsg.html()}<br/>`}${dzLastMsg.html()}`);
        }

        return Promise.resolve(response);
    },
};

$(vm.init);