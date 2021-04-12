import "bootstrap";
import "./bootstrap.scss";
import "./theme_1618041130349.css";
import "./custom.scss";
var bytes = require("bytes");
import Dropzone from "dropzone";
import "dropzone/dist/dropzone.css";
import "@fortawesome/fontawesome-free/js/solid.js";
import "@fortawesome/fontawesome-free/js/brands.js";
import "@fortawesome/fontawesome-free/js/fontawesome.js";
window.$ = window.jQuery = require("jquery");
import "gasparesganga-jquery-loading-overlay";
var { isText } = require("istextorbinary");
import "jquery.fancytree/dist/modules/jquery.fancytree.ui-deps.js";
import "jquery.fancytree/dist/modules/jquery.fancytree.js";
import "jquery.fancytree/dist/modules/jquery.fancytree.table.js"
import "jquery.fancytree/dist/skin-win8/ui.fancytree.css";
import JSZip from "jszip";
import ko from "knockout";
import _ from "lodash";
import "regenerator-runtime/runtime";
import { saveAs } from "file-saver";
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
    statuses: {},
    validUrl: "",
    url: ko.observable(""),
    user: ko.observable({}),
    config: ko.observable({}),
    syncRoot: ko.observable(null),
    mode: ko.observable("download"),
    sendSyncRoot: ko.observable(false),
    zipFileName: ko.observable("RSWebSync.zip"),
    sourceTree: () => $.ui.fancytree.getTree("#srcTree"),
    targetTree: () => $.ui.fancytree.getTree("#destTree"),
    queryUrl: (url.parse(window.location.href, true).query || {}).url || "",
    remoteTreeId: () => ko.computed(() => vm.mode() != "upload" ? "#srcTree" : "#destTree", vm),

    /**
     * Initialize the view model, dropzone and fancytree.
     */
    init() {
        vm.initDropzone();
        vm.remoteTreeId = vm.remoteTreeId();
        //$("#about").attr("href", "./info.html");
        $("#srcTree").fancytree({
            checkbox: true, extensions: ["table"], selectMode: 3, source: [],
            titlesTabbable: true, // Add all node titles to TAB chain
            quicksearch: true, // Jump to nodes when pressing first character
            table: {
                nodeColumnIdx: 1,     // render the node title into the 2nd column
                checkboxColumnIdx: 0  // render the checkboxes into the 1st column
            },
            click(_e, data) { data.node.toggleSelected(); return data.node.selected; },
            renderColumns(_e, data) {
                var node = data.node,
                    $tdList = $(node.tr).find(">td");

                // (index #0 is rendered by fancytree by adding the checkbox)
                // (index #1 is rendered by fancytree)
                $tdList.eq(2).text(node.folder ? "" : bytes.format(node.data.size));
                $tdList.eq(3).html(node.data.status);
            },
            select: (_e, _d) => vm.setSyncRoot()
        });
        $("#destTree").fancytree({
            checkbox: true, extensions: ["table"], selectMode: 1, source: [],
            titlesTabbable: true, // Add all node titles to TAB chain
            quicksearch: true, // Jump to nodes when pressing first character
            table: {
                nodeColumnIdx: 1,     // render the node title into the 2nd column
                checkboxColumnIdx: 0  // render the checkboxes into the 1st column
            },
            click(_e, data) { data.node.toggleSelected(); return data.node.selected; },
        });

        ko.applyBindings(vm);
        vm.setMode((url.parse(window.location.href, true).query || {}).mode || "download");
        vm.statuses = { inProgress: $("#statusInProgress").html(), success: $("#statusSuccess").html(), error: $("#statusError").html() };
    },

    /**
     * Clean and destroy dropzone if exists, then initialise.
     */
    initDropzone() {
        if (!!vm.dropzone) {
            vm.dropzone.removeAllFiles(true);
            vm.dropzone.destroy();
        }

        vm.dropzone = new Dropzone("#dropzone", {
            autoProcessQueue: false, accept: vm.loadLocal, createImageThumbnails: false, maxFilesize: null,
            parallelUploads: 1, previewsContainer: "#previews", processing: vm.upload, url: "#",
            init() { this.hiddenFileInput.setAttribute("webkitdirectory", true); },
            queuecomplete: () => vm.dropzone.options.autoProcessQueue = false
        });
        vm.dropzone.submitRequest = function (_x, _f, files) { this._finished(files, "locally resolved"); }
    },

    /**
     * Toggle between Upload and Download mode.
     * @param {string} mode - The upload or download mode.
     */
    setMode(mode) {
        vm.clear();
        vm.mode(mode);
        $(`#${mode}`).tab("show");
        vm.url(vm.validUrl || vm.queryUrl || "http://localhost/reports");
    },

    /**
     * Clear the user, url, dropzone, fancytrees, and toast.
     */
    clear() {
        vm.url("");
        vm.user({});
        vm.cache = {};
        toastr.remove();
        vm.initDropzone();
        vm.syncRoot(null);
        vm.sendSyncRoot(false);
        vm.sourceTree().clear();
        vm.targetTree().clear();
        $(".card-header").LoadingOverlay("hide");
    },

    /**
     * Load the relevant (folder, report, dataset, and mobile report) catalog items from SSRS staring from the url.
     * @returns {void}
     */
    loadRemotes() {
        $.ui.fancytree.getTree(vm.remoteTreeId()).clear();
        var root = $.ui.fancytree.getTree(vm.remoteTreeId()).rootNode;
        $(vm.remoteTreeId()).closest(".card").find(".card-header").LoadingOverlay("show");

        if (!vm.url().trim())
            vm.setMode(vm.mode());

        if (!!root && !!root.children && !!root.children.length && root.children[0].title == "No data.")
            root.tree.clear();

        var { cfg, opt, urls } = vm.getApiContexts();
        var flt = `startswith(Path, '${urls.length == 1 ? "/" : `/${urls[1]}`}') and (Type eq Model.CatalogItemType'Folder'${vm.mode() == "upload"
            ? ""
            : " or Type eq Model.CatalogItemType'Report' or Type eq Model.CatalogItemType'DataSet'"
            + " or Type eq Model.CatalogItemType'MobileReport' or Type eq Model.CatalogItemType'Resource'"})`;
        MeApiFactory(cfg, fetch, cfg.basePath).getUserDetails(opt)
            .then(usr =>
                vm.user(usr), vm.restCallback);
        CatalogItemsApiFactory(cfg, fetch, cfg.basePath).getCatalogItems(2147483647, 0, flt, false, "Path", "*", opt)
            .then(json => {
                [vm.cache, vm.validUrl] = [{}, vm.url().trim()];
                json.value.reduce((promise, item) => {
                    return promise
                        .then(() =>
                            //Wicked .rsmobile use the PackageId instead of its own Id to download by /CatalogItems(Guid)/Content/$value 
                            item.Type == CatalogItemType.MobileReport
                                ? CatalogItemsApiFactory(cfg, fetch, cfg.basePath).getCatalogItemProperties(item.Id, ["PackageId"], opt)
                                    .then(props =>
                                        item.Id = props.value[0].Value)
                                : Promise.resolve(item.Id))
                        .then(() => {
                            var [parent, child] = [root.findFirst(node => node.key == item.ParentFolderId), root.findFirst(_node => _node.key == item.Id)];

                            if (!child) child = (parent || root).addNode({
                                folder: item.Type == CatalogItemType.Folder, key: item.Id, item: item, size: item.Size,
                                title: `${item.Name}${vm.mode() == "upload" || item.Type == CatalogItemType.Folder ? "" : ` (${item.Type})`}`
                            });

                            child.item = () => item;

                            if (vm.mode() == "upload" && item.Type == CatalogItemType.Folder)
                                vm.cache[item.Path] = item;
                        })
                        .catch(vm.restCallback)
                        .finally(() => {
                            if (!item || item == _.last(json.value)) {
                                root.tree.expandAll();
                                toastr.success(`${vm.url()} loaded`);
                                $(vm.remoteTreeId()).closest(".card").find(".card-header").LoadingOverlay("hide");
                            }
                        });
                }, Promise.resolve());

                $(vm.remoteTreeId()).tooltip("dispose").tooltip({
                    html: true, sanitize: false, selector: ".dz-filename, .dz-size, .dz-status", title() {
                        var node = $.ui.fancytree.getNode(this);
                        return $(this).hasClass("dz-filename") ? `${node.item().Path} (${node.item().Type})` : node.data.message;
                    }
                });
            })
            .catch(reason => {
                vm.restCallback(reason);
                $(vm.remoteTreeId()).closest(".card").find(".card-header").LoadingOverlay("hide");
            });
    },

    /**
     * Get the objects required to make the SSRS REST API call.
     * @returns {{ cfg: Configuration, opt: any, urls: string[]}} - Returns the objects required to make the SSRS REST API call. 
     */
    getApiContexts() {
        var urls = vm.url().trim().split("/browse/");
        urls = _(urls).map(url => url.trim()).filter(url => !!url).value();
        var [cfg, opt] = [new Configuration({ basePath: `${urls[0]}/api/v2.0` }), { mode: "cors", credentials: "include", origin: location.origin }];

        var val = "";
        if (!!(val = (vm.config().accessToken || "").trim()))
            cfg.accessToken = val;
        if (!!(val = (vm.config().apiKey || "").trim()))
            cfg.apiKey = val;
        if (!!(val = (vm.config().username || "").trim()))
            cfg.username = val;
        if (!!(val = (vm.config().password || "").trim()))
            cfg.password = val;

        return { cfg, opt, urls };
    },

    /**
     * Load folder dragged and dropped in the dropzone to the Source tree.
     * @param {Dropzone.DropzoneFile} file - The added dropzone file.
     * @param {(error?: string | Error) => void} done - The callback, pass null to accept.
     * @returns {void}
     */
    loadLocal(file, done) {
        done();
        var [parent, paths] = [vm.sourceTree().rootNode, (file.fullPath = file.fullPath || file.webkitRelativePath).split("/")];

        if (!!parent && !!parent.children && !!parent.children.length && parent.children[0].title == "No data.")
            parent.tree.clear();

        for (var path of paths) {
            var child = parent.findFirst(node => node.parent == parent && node.title == path);
            parent = !child ? parent.addNode({ title: path, folder: path != _.last(paths), size: path != _.last(paths) ? 0 : file.size }) : child;

            if (!parent.folder)
                [file.node, parent.file] = [() => parent, () => file];
        }

        parent.tree.expandAll();

        if (!$("#srcTree").data || !$("#srcTree").data('tooltip'))
            $("#srcTree").tooltip("dispose").tooltip({
                html: true, sanitize: false, selector: ".dz-filename, .dz-size, .dz-status", title() {
                    var node = $.ui.fancytree.getNode(this);
                    return $(this).hasClass("dz-filename") ? node.getPath() : node.data.message;
                }
            });
    },

    /**
     * Set the sync root for the source tree (the common lowest root folder).
     */
    setSyncRoot() {
        if (!!vm.syncRoot())
            vm.syncRoot().removeClass("bg-warning");

        var nodes = vm.sourceTree().getSelectedNodes();
        var joins = (!!nodes.length ? _.first(nodes).getParentList(true, true) : []) || [];

        for (var node of _.drop(nodes, 1))
            joins = _.intersection(joins, node.getParentList(true, true)) || [];

        if (nodes.length == 1 && joins.length > 1 && nodes[0] == _.last(joins))
            joins.pop();

        vm.syncRoot(!!joins.length ? _.last(joins) : null);

        if (!!vm.syncRoot())
            vm.syncRoot().addClass("bg-warning");
    },

    /**
     * Select the error nodes only from the source tree.
     */
    selectErrorOnly() {
        if (vm.sourceTree().rootNode.hasChildren())
            for (var node of vm.sourceTree().rootNode.children)
                node.setSelected(false);

        vm.sourceTree().rootNode.visit(node => {
            if ((node.data.status || "").indexOf("danger") >= 0)
                node.setSelected(true);
        });
    },

    /**
     * Validate the inputs and run the action relevant to the selected mode. 
     * @returns {void}
     */
    run() {
        $(".card-header").LoadingOverlay("show");
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

        if (!vm.syncRoot()) {
            err = true;
            toastr.error("Can't find source sync root item");
        }

        if (vm.mode() == "upload" && !vm.targetTree().getSelectedNodes().length) {
            err = true;
            toastr.error("Destination folder is required");
        }

        toastr.options.newestOnTop = true;

        if (!err) {
            toastr.info(`Start ${vm.mode()} ${vm.mode() != "upload" ? "from" : "to"} ${vm.url()}`);

            if (vm.mode() != "upload")
                vm.download();
            else {
                for (var file of vm.dropzone.files) {
                    var node = file.node();
                    file.status = !node.selected ? file.status : Dropzone.QUEUED;

                    if (file.status == Dropzone.QUEUED) {
                        [node.data.message, node.data.status] = ["", ""];
                        node.render(true, false);
                    }
                }

                vm.lastQueuedSelectedFile = _.findLast(vm.dropzone.getQueuedFiles(), qf => !!qf.node().selected);
                vm.dropzone.options.autoProcessQueue = true;
                vm.dropzone.processQueue();
            }
        }
        else
            $(".card-header").LoadingOverlay("hide");
    },

    /**
     * Process the selected files from the Source tree to be downloaded from SSRS. 
     */
    download() {
        var zip = new JSZip();
        var { cfg, opt } = vm.getApiContexts();
        var cache = vm.cache = { [""]: zip, ["/"]: zip, [vm.syncRoot().item().Path]: zip };
        var typeToExts = { [CatalogItemType.Report]: ".rdl", [CatalogItemType.DataSet]: ".rsd", [CatalogItemType.MobileReport]: ".rsmobile" };
        var nodes = [];
        vm.syncRoot().visit(node => {
            if (!!node.selected || !!node.partsel) nodes.push(node);
        });
        nodes = _.orderBy(nodes, [node => node.item().Path.split("/").length, node => node.item().Path], ["asc", "asc"]);
        nodes.reduce((promise, node) => {
            return promise
                .then(() => {
                    var paths = node.item().Path.split("/");
                    var name = `${_.last(paths)}${typeToExts[node.item().Type] || ""}`;
                    var isTxt = (!name.endsWith(".rsmobile") && !!typeToExts[node.item().Type]) || isText(name);

                    if (!node.folder) {
                        [node.data.message, node.data.status] = ["", vm.statuses.inProgress];
                        node.render(true, false);
                    }

                    return node.folder
                        ? Promise.resolve(cache[node.item().Path] = cache[`${_.initial(paths).join("/")}`].folder(_.last(paths)))
                        : CatalogItemsApiFactory(cfg, fetch, cfg.basePath).getCatalogItemContent(node.key, opt)
                            .then(response =>
                                isTxt ? response.text() : response.blob())
                            .then(content =>
                                isTxt ? Promise.resolve(cache[`${_.initial(paths).join("/")}`].file(name, content))
                                    : new Promise((resolve, reject) => {
                                        var reader = new FileReader();
                                        reader.onerror = () =>
                                            reject({ message: reader.error.name, stack: reader.error.message });
                                        reader.onload = () => {
                                            var base64 = reader.result.replace("data:", "").replace(/^.+,/, "");
                                            resolve(cache[`${_.initial(paths).join("/")}`].file(name, base64, { base64: true }));
                                        };
                                        reader.readAsDataURL(content);
                                    }))
                            .then(() =>
                                vm.restCallback({ Id: 1, Type: node.item().Type }, node, name, "downloaded"));
                })
                .catch(response =>
                    vm.restCallback(response, node, _.last(node.item().Path.split("/"))))
                .finally(() => {
                    if (node == _.last(nodes)) {
                        zip.generateAsync({ type: "blob" })
                            .then(blob => {
                                saveAs(blob, vm.zipFileName().trim() || "RSWebSync.zip");
                                toastr.info(`Finish ${vm.mode()} from ${vm.url()}`);
                            })
                            .catch(vm.restCallback)
                            .finally(() =>
                                $(".card-header").LoadingOverlay("hide"));
                    }
                });
        }, Promise.resolve());
    },

    /**
     * Process the dropzone file to be uploaded to SSRS. 
     * @param {Dropzone.DropzoneFile} file - The dropzone file to be processed.
     */
    upload(file) {
        var [cache, node] = [vm.cache, file.node()];

        if (!node.selected)
            return;

        var { cfg, opt } = vm.getApiContexts();
        [node.data.message, node.data.status] = ["", vm.statuses.inProgress];
        node.render(true, false);
        var nodes = node.getParentList(true, true) || [];
        var extToTypes = { ["rdl"]: CatalogItemType.Report, ["rsd"]: CatalogItemType.DataSet, ["rsmobile"]: CatalogItemType.MobileReport };
        var paths = _(nodes).drop(nodes.findIndex(_node => _node == vm.syncRoot()) + (vm.sendSyncRoot() ? 0 : 1)).map(_node => _node.title).value();
        var reader = new FileReader();
        reader.onerror = () =>
            vm.restCallback({ message: reader.error.name, stack: reader.error.message }, file, _.last(paths));
        reader.onload = () => {
            var content = reader.result.replace("data:", "").replace(/^.+,/, "");
            paths.reduce((promise, path) => {
                return promise
                    .then(parent => {
                        var fullPath = `${parent.Path == "/" ? "" : parent.Path}/${path != _.last(paths) || !extToTypes[_.last(path.split("."))]
                            ? path : path.replace(`.${_.last(path.split("."))}`, "")}`;
                        return (!!cache[fullPath]
                            ? Promise.resolve({ value: [cache[fullPath]] })
                            : CatalogItemsApiFactory(cfg, fetch, cfg.basePath)
                                .getCatalogItems(2147483647, 0, `Path eq '${fullPath}'`, false, "Path", "*", opt))
                            .then(items => {
                                var [name, item] = [_.last(fullPath.split("/")), _.head((items || {}).value || [])];
                                var type = path != _.last(paths) ? CatalogItemType.Folder : (extToTypes[_.last(path.split("."))] || CatalogItemType.Resource);

                                if (!item) {
                                    if (path != _.last(paths))
                                        return CatalogItemsApiFactory(cfg, fetch, cfg.basePath).addCatalogItem({
                                            Name: name, Path: fullPath, Type: type, "@odata.type": `#Model.${type}`
                                        }, opt)
                                            .then(_item =>
                                                vm.restCallback((cache[fullPath] = _item), file, path, "added"));
                                    else
                                        return CatalogItemsApiFactory(cfg, fetch, cfg.basePath).addCatalogItem({
                                            Name: name, Path: fullPath, Type: type, Content: content, "@odata.type": `#Model.${type}`
                                        }, opt)
                                            .then(_item =>
                                                vm.restCallback(_item, file, path, "added"));
                                } else {
                                    if (path != _.last(paths))
                                        return Promise.resolve(item)
                                            .then(_item =>
                                                vm.restCallback((cache[fullPath] = _item), file, path, "exists"));
                                    else
                                        //for some reason only PUT update successfully instead of PATCH as documented in SSRS REST API
                                        return CatalogItemsApiFactory(cfg, fetch, cfg.basePath).updateCatalogItem(item.Id, {
                                            Name: name, Path: fullPath, Type: type, Content: content, "@odata.type": `#Model.${type}`
                                        }, Object.assign({}, opt, { method: "PUT" }))
                                            .then(_item =>
                                                vm.restCallback(_item, file, path, "updated"));
                                }
                            }, () => { });
                    })
                    .catch(response =>
                        vm.restCallback(response, file, path))
                    .finally(() => {
                        if (file == vm.lastQueuedSelectedFile && path == _.last(paths)) {
                            $(".card-header").LoadingOverlay("hide");
                            toastr.info(`Finish upload to ${vm.url()}`);
                        }
                    });
            }, Promise.resolve(vm.targetTree().getSelectedNodes()[0].item()));
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
     * @param {Dropzone.DropzoneFile || FancyTreeNode} file - The file or node object. 
     * @param {String} path - The path string. 
     * @param {String} action - The action string. 
     */
    restCallback(response, file, path, action) {
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
            var node = !file.node ? file : file.node();

            if (path == (!file.node ? path : _.last(file.fullPath.split("/")))) {
                file.status = !!response.Id || (!!response.status && response.status >= 200 && response.status < 300) ? Dropzone.SUCCESS : Dropzone.ERROR;
                node.data.status = file.status == Dropzone.SUCCESS ? vm.statuses.success : vm.statuses.error;
                node.render(true, false);
            }

            var msg = !!response.Id
                ? `<div class='text-success'>${!path ? "" : `${path}=> `}${response.Type}: ${action}</div>`
                : !!response.status
                    ? `<div class='text-${response.status >= 200 && response.status < 300 ? "success" : "danger"}'>` +
                    `${!path ? "" : `${path}=> `}${response.status}: ${response.statusText}</div>`
                    : `<div class='text-danger'>${!path ? "" : `${path}=> `}${response.message}: ${response.stack}</div>`;

            node.data.message = `${!node.data.message ? "" : `${node.data.message}<br/>`}${msg}`;
        }

        return Promise.resolve(response);
    },
};

$(vm.init);