/*!
* angular-winjs
*
* Copyright 2013 Josh Williams and other contributors
* Released under the MIT license
*/
(function (global) {
    "use strict;"

    // Pure utility
    //
    function objectMap(obj, mapping) {
        return Object.keys(obj).reduce(function (result, key) {
            var value = mapping(obj[key], key);
            if (value) {
                result[key] = value;
            }
            return result;
        }, {});
    }

    function root(element) {
        return element.parentNode ? root(element.parentNode) : element;
    }

    function select(selector, element) {
        return document.querySelector(selector) || root(element).querySelector(selector);
    }

    var WrapperList = WinJS.Class.derive(WinJS.Binding.List, function (array) {
        WinJS.Binding.List.call(this, array);
    });

    // Directive utilities
    //
    function addDestroyListener($scope, control, bindings) {
        $scope.$on("$destroy", function () {
            bindings.forEach(function (w) { w(); });

            if (control.dispose) {
                control.dispose();
            }
        });
    }

    function list($scope, key, getList, bindings) {
        var initialBindings = bindings.length;
        var value = $scope[key];
        if (value) {
            if (Array.isArray(value)) {
                value = new WrapperList(value);
                bindings.push($scope.$watchCollection(key, function (array) {
                    var list = getList();
                    if (!list) {
                        return;
                    }
                    if (!array) {
                        list.length = 0;
                        return;
                    }
                    var targetIndicies = new Map();
                    for (var i = 0, len = array.length; i < len; i++) {
                        targetIndicies.set(array[i], i);
                    }
                    var arrayIndex = 0, listIndex = 0;
                    while (arrayIndex < array.length) {
                        var arrayData = array[arrayIndex];
                        if (listIndex >= list.length) {
                            list.push(arrayData);
                        } else {
                            while (listIndex < list.length) {
                                var listData = list.getAt(listIndex);
                                if (listData === arrayData) {
                                    listIndex++;
                                    arrayIndex++;
                                    break;
                                } else {
                                    if (targetIndicies.has(listData)) {
                                        var targetIndex = targetIndicies.get(listData);
                                        if (targetIndex < arrayIndex) {
                                            // already in list, remove the duplicate
                                            list.splice(listIndex, 1);
                                        } else {
                                            list.splice(listIndex, 0, arrayData);
                                            arrayIndex++;
                                            listIndex++;
                                            break;
                                        }
                                    } else {
                                        // deleted, remove from list
                                        list.splice(listIndex, 1);
                                    }
                                }
                            }
                        }
                    }
                    // clip any items which are left over in the tail.
                    list.length = array.length;
                }));
            }
            if (value.dataSource) {
                value = value.dataSource;
            }
        }
        if (bindings.length === initialBindings) {
            bindings.push($scope.$watch(key, function (newValue, oldValue) {
                if (newValue !== oldValue) {
                    getControl()[key] = newValue;
                }
            }));
        }
        return value;
    }

    function BINDING_anchor($scope, key, element, getControl, bindings) {
        bindings.push($scope.$watch(key, function (newValue, oldValue) {
            newValue = typeof newValue === "string" ? select(newValue, element) : newValue;
            oldValue = typeof oldValue === "string" ? select(oldValue, element) : oldValue;
            if (oldValue && oldValue._anchorClick) {
                oldValue.removeEventListener("click", oldValue._anchorClick);
                oldValue._anchorClick = null;
            }
            if (newValue && !newValue._anchorClick) {
                newValue._anchorClick = function () { getControl().show(); };
                newValue.addEventListener("click", newValue._anchorClick);
            }
            return newValue;
        }));
        var anchor = $scope[key];
        return typeof anchor === "string" ? select(anchor, element) : anchor;
    }
    BINDING_anchor.binding = "=?";

    function BINDING_dataSource($scope, key, element, getControl, bindings) {
        function getList() {
            var control = getControl();
            if (control) {
                var list = control[key];
                if (list) {
                    return list.list;
                }
            }
        };
        return list($scope, key, getList, bindings);
    }
    BINDING_dataSource.binding = "=?";

    function BINDING_event($scope, key, element, getControl, bindings) {
        bindings.push($scope.$watch(key, function (newValue, oldValue) {
            if (newValue !== oldValue) {
                getControl()[key] = newValue;
            }
        }))
        var value = $scope[key];
        return function (event) {
            switch ($scope.$root.$$phase) {
                case "$apply":
                case "$digest":
                    value({ $event: event });
                    break;
                default:
                    $scope.$apply(function () {
                        value({ $event: event });
                    });
                    break;
            }
        };
    }
    BINDING_event.binding = "&";

    function BINDING_property($scope, key, element, getControl, bindings) {
        bindings.push($scope.$watch(key, function (newValue, oldValue) {
            if (newValue !== oldValue) {
                getControl()[key] = newValue;
            }
        }));
        return $scope[key];
    }
    BINDING_property.binding = "=?";

    function BINDING_selection($scope, key, element, getControl, bindings) {
        bindings.push($scope.$watchCollection(key, function (selection) {
            var value = getControl()[key];
            if (value) {
                value.set(selection);
            }
        }));
        return $scope[key];
    }
    BINDING_selection.binding = "=?";

    function BINDING_list($scope, key, element, getControl, bindings) {
        function getList() {
            var control = getControl();
            if (control) {
                return control[key];
            }
        }
        return list($scope, key, getList, bindings);
    }
    BINDING_list.binding = "=?";

    // Shared compile/link functions
    //
    function compileTemplate(name) {
        return function (tElement, tAttrs, transclude) {
            var rootElement = document.createElement("div");
            Object.keys(tAttrs).forEach(function (key) {
                if (key[0] !== '$') {
                    rootElement.setAttribute(key, tAttrs[key]);
                }
            });
            var immediateToken;
            return function ($scope, elements, attrs, parents) {
                var parent = parents.reduce(function (found, item) { return found || item; });
                parent[name] = function (itemPromise) {
                    return WinJS.Promise.as(itemPromise).then(function (item) {
                        var itemScope = $scope.$new();
                        itemScope.item = item;
                        var result = rootElement.cloneNode(false);
                        transclude(itemScope, function (clonedElement) {
                            for (var i = 0, len = clonedElement.length; i < len; i++) {
                                result.appendChild(clonedElement[i]);
                            }
                        });
                        WinJS.Utilities.markDisposable(result, function () {
                            itemScope.$destroy();
                        });
                        immediateToken = immediateToken || setImmediate(function () {
                            immediateToken = null;
                            itemScope.$apply();
                        });
                        return result;
                    })
                };
            };
        };
    }

    // WinJS module definition
    //
    var module = angular.module("winjs", []);

    module.run(function ($rootScope) {
        var Scope = Object.getPrototypeOf($rootScope);
        var Scope$eval = Scope.$eval;
        Scope.$eval = function (expr, locals) {
            var that = this;
            return MSApp.execUnsafeLocalFunction(function () {
                return Scope$eval.call(that, expr, locals);
            });
        };
    })

    // Directives
    //
    module.directive("winAppBar", function () {
        var api = {
            commands: BINDING_property,
            disabled: BINDING_property,
            hidden: BINDING_property,
            layout: BINDING_property,
            placement: BINDING_property,
            sticky: BINDING_property,
            onafterhide: BINDING_event,
            onaftershow: BINDING_event,
            onbeforehide: BINDING_event,
            onbeforeshow: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV ng-transclude='true'></DIV>",
            transclude: true,
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var appbar;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return appbar; }, bindings); });
                appbar = new WinJS.UI.AppBar(element, options)
                addDestroyListener($scope, appbar, bindings);
                return appbar;
            },
        };
    });

    module.directive("winAppBarCommand", function () {
        var api = {
            disabled: BINDING_property,
            extraClass: BINDING_property,
            firstElementFocus: BINDING_property,
            flyout: BINDING_property,
            hidden: BINDING_property,
            icon: BINDING_property,
            id: BINDING_property,
            label: BINDING_property,
            lastElementFocus: BINDING_property,
            section: BINDING_property,
            selected: BINDING_property,
            tooltip: BINDING_property,
            type: BINDING_property,
            onclick: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<BUTTON ng-transclude='true'></BUTTON>",
            transclude: true,
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var command;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return command; }, bindings); });
                command = new WinJS.UI.AppBarCommand(element, options)
                addDestroyListener($scope, command, bindings);
                return command;
            },
        };
    });

    module.directive("winBackButton", function () {
        return {
            restrict: "E",
            replace: true,
            template: "<BUTTON></BUTTON>",
            link: function ($scope, elements) {
                var element = elements[0];
                var control = new WinJS.UI.BackButton(element);
                addDestroyListener($scope, control, []);
                return control;
            }
        };
    });

    module.directive("winCellSpanningLayout", function () {
        var api = {
            groupHeaderPosition: BINDING_property,
            groupInfo: BINDING_property,
            itemInfo: BINDING_property,
            maximumRowsOrColumns: BINDING_property,
            orientation: BINDING_property,
        };
        return {
            require: "^winListView",
            restrict: "E",
            replace: true,
            template: "",
            scope: objectMap(api, function (value) { return value.binding; }),
            link: function ($scope, elements, attrs, listView) {
                var bindings = [];
                var layout;
                var options = objectMap(api, function (value, key) { return value($scope, key, null, function () { return layout; }, bindings); });
                layout = listView.layout = new WinJS.UI.CellSpanningLayout(options);
                addDestroyListener($scope, layout, bindings);
                return layout;
            },
        };
    });

    module.directive("winCommandTemplate", function () {
        return {
            require: ["^?winNavBarContainer"],
            restrict: "E",
            replace: true,
            transclude: true,
            compile: compileTemplate("template"),
        };
    });

    module.directive("winDatePicker", function () {
        var api = {
            calendar: BINDING_property,
            current: BINDING_property,
            datePattern: BINDING_property,
            disabled: BINDING_property,
            maxYear: BINDING_property,
            minYear: BINDING_property,
            monthPattern: BINDING_property,
            yearPattern: BINDING_property,
            onchange: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV></DIV>",
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var datePicker;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return datePicker; }, bindings); });
                datePicker = new WinJS.UI.DatePicker(element, options);
                datePicker.addEventListener("change", function () {
                    $scope.$apply(function () {
                        $scope["current"] = datePicker["current"];
                    });
                });
                addDestroyListener($scope, datePicker, bindings);
                return datePicker;
            },
        };
    });

    module.directive("winFlipView", function () {
        var api = {
            currentPage: BINDING_property,
            itemDataSource: BINDING_dataSource,
            itemSpacing: BINDING_property,
            itemTemplate: BINDING_property,
            orientation: BINDING_property,
            ondatasourcecountchanged: BINDING_event,
            onpagecompleted: BINDING_event,
            onpageselected: BINDING_event,
            onpagevisibilitychanged: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV ng-transclude='true'></DIV>",
            transclude: true,
            controller: function ($scope) {
                Object.defineProperty(this, "itemTemplate", {
                    get: function () { return $scope["itemTemplate"]; },
                    set: function (value) { $scope["itemTemplate"] = value; }
                });
            },
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var flipView;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return flipView; }, bindings); });
                flipView = new WinJS.UI.FlipView(element, options);
                addDestroyListener($scope, flipView, bindings);
                return flipView;
            },
        };
    });

    module.directive("winFlyout", function () {
        var api = {
            alignment: BINDING_property,
            anchor: BINDING_anchor,
            hidden: BINDING_property,
            placement: BINDING_property,
            onafterhide: BINDING_event,
            onaftershow: BINDING_event,
            onbeforehide: BINDING_event,
            onbeforeshow: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV ng-transclude='true'></DIV>",
            transclude: true,
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var flyout;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return flyout; }, bindings); });
                flyout = new WinJS.UI.Flyout(element, options);
                var anchor = flyout.anchor;
                if (anchor && anchor instanceof HTMLElement && !anchor._anchorClick) {
                    anchor._anchorClick = function () { flyout.show(); };
                    anchor.addEventListener("click", anchor._anchorClick);
                }
                addDestroyListener($scope, flyout, bindings);
                return flyout;
            },
        };
    });

    module.directive("winGridLayout", function () {
        var api = {
            groupHeaderPosition: BINDING_property,
            maximumRowsOrColumns: BINDING_property,
            orientation: BINDING_property,
        };
        return {
            require: "^winListView",
            restrict: "E",
            replace: true,
            template: "",
            scope: objectMap(api, function (value) { return value.binding; }),
            link: function ($scope, elements, attrs, listView) {
                var bindings = [];
                var layout;
                var options = objectMap(api, function (value, key) { return value($scope, key, null, function () { return layout; }, bindings); });
                layout = listView.layout = new WinJS.UI.GridLayout(options);
                addDestroyListener($scope, layout, bindings);
                return layout;
            },
        };
    });

    module.directive("winGroupHeaderTemplate", function () {
        return {
            require: ["^?winListView"],
            restrict: "E",
            replace: true,
            transclude: true,
            compile: compileTemplate("groupHeaderTemplate"),
        };
    });

    module.directive("winHub", function () {
        var api = {
            headerTemplate: BINDING_property,
            indexOfFirstVisible: BINDING_dataSource,
            indexOfLastVisible: BINDING_property,
            loadingState: BINDING_property,
            orientation: BINDING_property,
            scrollPosition: BINDING_property,
            sectionOnScreen: BINDING_property,
            sections: BINDING_list,
            oncontentanimating: BINDING_event,
            onheaderinvoked: BINDING_event,
            onloadingstatechanged: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV ng-transclude='true'></DIV>",
            transclude: true,
            controller: function ($scope) {
                Object.defineProperty(this, "headerTemplate", {
                    get: function () { return $scope["headerTemplate"]; },
                    set: function (value) { $scope["headerTemplate"] = value; }
                });
            },
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var hub;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return hub; }, bindings); });
                hub = new WinJS.UI.Hub(element, options);
                hub.addEventListener("loadingstatechanged", function () {
                    $scope.$apply(function () {
                        $scope["loadingState"] = hub["loadingState"];
                    });
                });
                addDestroyListener($scope, hub, bindings);
                return hub;
            },
        };
    });

    module.directive("winHubSection", function () {
        var api = {
            header: BINDING_property,
            isHeaderStatic: BINDING_property,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV ng-transclude='true'></DIV>",
            transclude: true,
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var section;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return section; }, bindings); });
                section = new WinJS.UI.HubSection(element, options)
                addDestroyListener($scope, section, bindings);
                return section;
            },
        };
    });

    module.directive("winItemContainer", function () {
        var api = {
            draggable: BINDING_property,
            selected: BINDING_dataSource,
            selectionDisabled: BINDING_property,
            swipeBehavior: BINDING_property,
            tapBehavior: BINDING_property,
            oninvoked: BINDING_event,
            onselectionchanged: BINDING_event,
            onselectionchanging: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV ng-transclude='true'></DIV>",
            transclude: true,
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var itemContainer;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return itemContainer; }, bindings); });
                itemContainer = new WinJS.UI.ItemContainer(element, options);
                itemContainer.addEventListener("selectionchanged", function () {
                    $scope.$apply(function () {
                        $scope["selected"] = itemContainer["selected"];
                    });
                });
                addDestroyListener($scope, itemContainer, bindings);
                return itemContainer;
            },
        };
    });

    module.directive("winItemTemplate", function () {
        return {
            require: ["^?winListView", "^?winFlipView"],
            restrict: "E",
            replace: true,
            transclude: true,
            compile: compileTemplate("itemTemplate"),
        };
    });

    module.directive("winListLayout", function () {
        var api = {
            groupHeaderPosition: BINDING_property,
            orientation: BINDING_property,
        };
        return {
            require: "^winListView",
            restrict: "E",
            replace: true,
            template: "",
            scope: objectMap(api, function (value) { return value.binding; }),
            link: function ($scope, elements, attrs, listView) {
                var bindings = [];
                var layout;
                var options = objectMap(api, function (value, key) { return value($scope, key, null, function () { return layout; }, bindings); });
                layout = listView.layout = new WinJS.UI.ListLayout(options);
                addDestroyListener($scope, layout, bindings);
                return layout;
            },
        };
    });

    module.directive("winListView", function () {
        var api = {
            currentItem: BINDING_property,
            groupDataSource: BINDING_dataSource,
            groupHeaderTemplate: BINDING_property,
            groupHeaderTapBehavior: BINDING_property,
            indexOfFirstVisible: BINDING_property,
            indexOfLastVisible: BINDING_property,
            itemDataSource: BINDING_dataSource,
            itemsDraggable: BINDING_property,
            itemsReorderable: BINDING_property,
            itemTemplate: BINDING_property,
            layout: BINDING_property,
            loadingBehavior: BINDING_property,
            maxDeferredItemsCleanup: BINDING_property,
            scrollPosition: BINDING_property,
            selection: BINDING_selection,
            selectionMode: BINDING_property,
            swipeBehavior: BINDING_property,
            tapBehavior: BINDING_property,
            oncontentanimating: BINDING_event,
            ongroupheaderinvoked: BINDING_event,
            onitemdragstart: BINDING_event,
            onitemdragenter: BINDING_event,
            onitemdragbetween: BINDING_event,
            onitemdragleave: BINDING_event,
            onitemdragchanged: BINDING_event,
            onitemdragdrop: BINDING_event,
            oniteminvoked: BINDING_event,
            onkeyboardnavigating: BINDING_event,
            onloadingstatechanged: BINDING_event,
            onselectionchanged: BINDING_event,
            onselectionchanging: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV ng-transclude='true'></DIV>",
            transclude: true,
            controller: function ($scope) {
                Object.defineProperty(this, "itemTemplate", {
                    get: function () { return $scope["itemTemplate"]; },
                    set: function (value) { $scope["itemTemplate"] = value; }
                });
                Object.defineProperty(this, "groupHeaderTemplate", {
                    get: function () { return $scope["groupHeaderTemplate"]; },
                    set: function (value) { $scope["groupHeaderTemplate"] = value; }
                });
                Object.defineProperty(this, "layout", {
                    get: function () { return $scope["layout"]; },
                    set: function (value) { $scope["layout"] = value; }
                });
                Object.defineProperty(this, "selection", {
                    get: function () { return $scope["selection"]; },
                    set: function (value) { $scope["selection"] = value; }
                });
            },
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var listView;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return listView; }, bindings); });
                listView = new WinJS.UI.ListView(element, options);
                listView.addEventListener("selectionchanged", function () {
                    var value = $scope["selection"];
                    if (value) {
                        $scope.$apply(function () {
                            var current = listView.selection.getIndices();
                            value.length = 0;
                            current.forEach(function (item) {
                                value.push(item);
                            });
                        });
                    }
                });
                addDestroyListener($scope, listView, bindings);
                return listView;
            },
        };
    });

    module.directive("winMenu", function () {
        var api = {
            alignment: BINDING_property,
            anchor: BINDING_anchor,
            commmands: BINDING_property,
            onafterhide: BINDING_event,
            onaftershow: BINDING_event,
            onbeforehide: BINDING_event,
            onbeforeshow: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV ng-transclude='true'></DIV>",
            transclude: true,
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var menu;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return menu; }, bindings); });
                menu = new WinJS.UI.Menu(element, options);
                var anchor = menu.anchor;
                if (anchor && anchor instanceof HTMLElement && anchor._anchorClick) {
                    anchor._anchorClick = function () { menu.show(); };
                    anchor.addEventListener("click", anchor._anchorClick);
                }
                addDestroyListener($scope, menu, bindings);
                return menu;
            },
        };
    });

    module.directive("winMenuCommand", function () {
        var api = {
            disabled: BINDING_property,
            extraClass: BINDING_property,
            flyout: BINDING_property,
            hidden: BINDING_property,
            id: BINDING_property,
            label: BINDING_property,
            section: BINDING_property,
            selected: BINDING_property,
            type: BINDING_property,
            onclick: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<BUTTON></BUTTON>",
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var command;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return command; }, bindings); });
                command = new WinJS.UI.MenuCommand(element, options)
                addDestroyListener($scope, command, bindings);
                return command;
            },
        };
    });

    module.directive("winNavBar", function () {
        return {
            restrict: "E",
            replace: true,
            template: "<DIV ng-transclude='true'></DIV>",
            transclude: true,
            link: function ($scope, elements) {
                var element = elements[0];
                var navbar = new WinJS.UI.NavBar(element);
                addDestroyListener($scope, navbar, []);
                return navbar;
            },
        };
    });

    module.directive("winNavBarCommand", function () {
        var api = {
            icon: BINDING_property,
            label: BINDING_property,
            location: BINDING_property,
            splitButton: BINDING_property,
            state: BINDING_property,
            tooltip: BINDING_property,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV ng-transclude='true'></DIV>",
            transclude: true,
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var command;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return command; }, bindings); });
                command = new WinJS.UI.NavBarCommand(element, options)
                addDestroyListener($scope, command, bindings);
                return command;
            },
        };
    });

    module.directive("winNavBarContainer", function () {
        var api = {
            data: BINDING_list,
            fixedSize: BINDING_property,
            layout: BINDING_property,
            template: BINDING_property,
            maxRows: BINDING_property,
            oninvoked: BINDING_event,
            onsplittoggle: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV ng-transclude='true'></DIV>",
            transclude: true,
            controller: function ($scope) {
                Object.defineProperty(this, "template", {
                    get: function () { return $scope["template"]; },
                    set: function (value) { $scope["template"] = value; }
                });
            },
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var container;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return container; }, bindings); });
                container = new WinJS.UI.NavBarContainer(element, options)
                addDestroyListener($scope, container, bindings);
                return container;
            },
        };
    });

    module.directive("winRating", function () {
        var api = {
            averageRating: BINDING_property,
            disabled: BINDING_property,
            enableClear: BINDING_property,
            maxRating: BINDING_property,
            tooltipStrings: BINDING_property,
            userRating: BINDING_property,
            oncancel: BINDING_event,
            onchange: BINDING_event,
            onpreviewchange: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV></DIV>",
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var rating;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return rating; }, bindings); });
                rating = new WinJS.UI.Rating(element, options);
                rating.addEventListener("change", function () {
                    $scope.$apply(function () {
                        $scope["userRating"] = rating["userRating"];
                    });
                });
                addDestroyListener($scope, rating, bindings);
                return rating;
            },
        };
    });

    module.directive("winSearchBox", function () {
        var api = {
            chooseSuggestionOnEnter: BINDING_property,
            disabled: BINDING_property,
            focusOnKeyboardInput: BINDING_property,
            placeholderText: BINDING_property,
            queryText: BINDING_property,
            searchHistoryContext: BINDING_property,
            searchHistoryDisabled: BINDING_property,
            onquerychanged: BINDING_event,
            onquerysubmitted: BINDING_event,
            onreceivingfocusonkeyboardinput: BINDING_event,
            onresultsuggestionchosen: BINDING_event,
            onsuggestionsrequested: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV></DIV>",
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var searchBox;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return searchBox; }, bindings); });
                searchBox = new WinJS.UI.SearchBox(element, options);
                searchBox.addEventListener("querychanged", function () {
                    $scope.$apply(function () {
                        $scope["queryText"] = searchBox["queryText"];
                    });
                });
                addDestroyListener($scope, searchBox, bindings);
                return searchBox;
            },
        };
    });

    module.directive("winSectionHeaderTemplate", function () {
        return {
            require: ["^?winHub"],
            restrict: "E",
            replace: true,
            transclude: true,
            compile: compileTemplate("headerTemplate"),
        };
    });

    module.directive("winSemanticZoom", function () {
        var api = {
            enableButton: BINDING_property,
            locked: BINDING_property,
            zoomedOut: BINDING_property,
            zoomFactor: BINDING_property,
            onzoomchanged: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV ng-transclude='true'></DIV>",
            transclude: true,
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var sezo;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return sezo; }, bindings); });
                sezo = new WinJS.UI.SemanticZoom(element, options)
                addDestroyListener($scope, sezo, bindings);
                return sezo;
            },
        };
    });

    module.directive("winTimePicker", function () {
        var api = {
            clock: BINDING_property,
            current: BINDING_property,
            disabled: BINDING_property,
            hourPattern: BINDING_property,
            minuteIncrement: BINDING_property,
            minutePattern: BINDING_property,
            periodPattern: BINDING_property,
            onchange: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV></DIV>",
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var timePicker;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return timePicker; }, bindings); });
                timePicker = new WinJS.UI.TimePicker(element, options);
                timePicker.addEventListener("change", function () {
                    $scope.$apply(function () {
                        $scope["current"] = timePicker["current"];
                    });
                });
                addDestroyListener($scope, timePicker, bindings);
                return timePicker;
            },
        };
    });

    module.directive("winToggleSwitch", function () {
        var api = {
            checked: BINDING_property,
            disabled: BINDING_property,
            labelOff: BINDING_property,
            labelOn: BINDING_property,
            title: BINDING_property,
            onchange: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV></DIV>",
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var toggle;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return toggle; }, bindings); });
                toggle = new WinJS.UI.ToggleSwitch(element, options);
                toggle.addEventListener("change", function () {
                    $scope.$apply(function () {
                        $scope["checked"] = toggle["checked"];
                    });
                });
                addDestroyListener($scope, toggle, bindings);
                return toggle;
            },
        };
    });

    module.directive("winTooltip", function () {
        var api = {
            contentElement: BINDING_property,
            extraClass: BINDING_property,
            innerHTML: BINDING_property,
            infotip: BINDING_property,
            placement: BINDING_property,
            onbeforeclose: BINDING_event,
            onbeforeopen: BINDING_event,
            onclosed: BINDING_event,
            onopened: BINDING_event,
        };
        return {
            restrict: "E",
            replace: true,
            scope: objectMap(api, function (value) { return value.binding; }),
            template: "<DIV ng-transclude='true'></DIV>",
            transclude: true,
            controller: function ($scope) {
                Object.defineProperty(this, "contentElement", {
                    get: function () { return $scope["contentElement"]; },
                    set: function (value) { $scope["contentElement"] = value; }
                });
            },
            link: function ($scope, elements) {
                var element = elements[0];
                var bindings = [];
                var tooltip;
                var options = objectMap(api, function (value, key) { return value($scope, key, element, function () { return tooltip; }, bindings); });
                tooltip = new WinJS.UI.Tooltip(element, options)
                addDestroyListener($scope, tooltip, bindings);
                return tooltip;
            },
        };
    });

    // Tooltop is a little odd because you have to be able to specify both the element
    // which has a tooltip (the content) and the tooltip's content itself. We specify
    // a special directive <win-tooltip-content /> which represents the latter.
    module.directive("winTooltipContent", function () {
        return {
            require: "^winTooltip",
            restrict: "E",
            replace: true,
            transclude: true,
            template: "\
<div style='display:none'>\
  <div ng-transclude='true'></div>\
</div>",
            link: function ($scope, elements, attrs, tooltip) {
                tooltip.contentElement = elements[0].firstElementChild;
            },
        };
    });

    // @TODO, This guy is a real odd-ball, you really need to coordinate with the settings 
    // event which fires, I need to think more about this.
    WinJS.UI.SettingsFlyout;

    // Do not support explicitly, use ng-repeat
    //WinJS.UI.Repeater;

}(this));
