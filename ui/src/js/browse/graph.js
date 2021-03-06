app.controller('BrowseGraphController', function($location, $rootScope, $routeParams, $scope, $timeout, $window,
    browseCollection, bulk, globalHotkeys, hotkeys, library, storage, timeRange) {

    $scope.section = $routeParams.section;
    $scope.id = $routeParams.id;
    $scope.state = stateLoading;
    $scope.collections = {};
    $scope.collectionsLoaded = false;
    $scope.graphs = [];

    $scope.startTime = null;
    $scope.endTime = null;
    $scope.time = null;
    $scope.range = null;

    $scope.form = {
        filter: ''
    };

    // Set range values
    $scope.rangeValues = timeRanges;

    // Define helper functions
    function locationApplyRange() {
        $location.skipReload()
            .search('start', $scope.startTime ? moment($scope.startTime).format(timeFormatRFC3339) : null)
            .search('end', $scope.endTime ? moment($scope.endTime).format(timeFormatRFC3339) : null)
            .search('time', $scope.time ? moment($scope.time).format(timeFormatRFC3339) : null)
            .search('range', $scope.range || null)
            .replace();
    }

    // Register scope functions
    $scope.refresh = function() {
        $rootScope.$emit('RefreshGraph');
    };

    $scope.resetRange = function() {
        $scope.startTime = null;
        $scope.endTime = null;
        $scope.time = null;
        $scope.range = null;

        $rootScope.$emit('ResetTimeRange');

        if (angular.equals($location.search(), {})) {
            return;
        }

        locationApplyRange();
    };

    $scope.setRange = function(range) {
        if (range != 'custom') {
            range = '-' + range;

            $rootScope.$emit('ApplyGraphOptions', {range: range});

            if ($scope.range === range) {
                return;
            }

            $scope.startTime = null;
            $scope.endTime = null;
            $scope.time = null;
            $scope.range = range || null;

            locationApplyRange();

            return;
        }

        $rootScope.$emit('PromptTimeRange', function(startTime, endTime, time, range) {
            if ($scope.startTime === startTime && $scope.endTime === endTime && $scope.time === time &&
                $scope.range === range) {
                return;
            }

            $scope.startTime = startTime;
            $scope.endTime = endTime;
            $scope.time = time;
            $scope.range = range;

            $rootScope.$emit('ApplyGraphOptions', startTime && endTime ? {
                start_time: startTime,
                end_time: endTime
            } : {
                time: time,
                range: range
            });

            locationApplyRange();
        }, {
            start: $scope.startTime,
            end: $scope.endTime,
            time: $scope.time,
            range: $scope.range
        });
    };

    $scope.setRefresh = function(e) {
        e.stopPropagation();

        $rootScope.showModal({
            type: dialogTypePrompt,
            message: 'label.graphs_refresh',
            note: 'label.refresh_interval_unit',
            value: $scope.refreshInterval,
            inputType: 'number',
            labels: {
                validate: 'label.graphs_refresh_set'
            }
        }, function(data) {
            if (data === undefined) {
                return;
            }

            $scope.refreshInterval = parseInt(data.value, 10);
            $rootScope.$emit('ApplyGraphOptions', {refresh_interval: $scope.refreshInterval});

            $location.skipReload()
                .search('refresh', $scope.refreshInterval || null)
                .replace();
        });
    };

    $scope.setGrid = function(size) {
        $scope.gridSize = size;
        storage.set('browse-grid', $scope.section + '-' + $scope.id, size);
        angular.element($window).trigger('resize');
    };

    $scope.toggleLegends = function(state) {
        $rootScope.$emit('ToggleGraphLegend', null, null, state);
        $scope.showLegends = state;
    };

    $scope.handleGraphFocus = function(e, index) {
        angular.element('#graph' + index).next().toggleClass('focus', e.type == 'mouseenter');
    };

    $scope.resetFilter = function() {
        $scope.form.filter = '';
    };

    $scope.$watch('form.filter', function(newValue, oldValue) {
        if (angular.equals(newValue, oldValue)) {
            return;
        }

        if ($scope.filterTimeout) {
            $timeout.cancel($scope.filterTimeout);
            $scope.filterTimeout = null;
        }

        $scope.filterTimeout = $timeout(function() {
            var pause = {},
                count = 0;

            angular.forEach($scope.graphs, function(entry) {
                entry.hidden = entry.title.toLowerCase().indexOf(newValue.toLowerCase()) == -1;
                if (!entry.hidden) {
                    count++;
                }

                if (pause[entry.id] === undefined) {
                    pause[entry.id] = entry.hidden;
                }
            });

            angular.forEach(pause, function(state, id) {
                $rootScope.$emit('PauseGraphDraw', id, state);
            });

            $scope.noMatch = count === 0;
        }, 500);
    });

    // Attach events
    var unregisterPromptTimerange = $rootScope.$on('PromptTimeRange', function(e, callback, data) {
        timeRange.prompt(callback, data);
    });

    $scope.$on('$destroy', function() {
        unregisterPromptTimerange();
    });

    $scope.$on('GraphLoaded', function(e, idx, id) {
        var key = $scope.section + '_' + $scope.id,
            data = storage.get('browse-graph_state', key, {}),
            state = data[idx + '_' + id] || {};

        if (state.legendActive) {
            $rootScope.$emit('ToggleGraphLegend', idx, id, state);
        }
    });

    $scope.$on('GraphChanged', function(e, idx, id, state) {
        var key = $scope.section + '_' + $scope.id,
            data = storage.get('browse-graph_state', key, {});

        data[idx + '_' + id] = state;
        storage.set('browse-graph_state', key, data);
    });

    // Handle tree state save
    $scope.$on('$locationChangeStart', browseCollection.saveTreeState);
    angular.element($window).on('beforeunload', browseCollection.saveTreeState);

    // Load collections and graphs data
    if ($scope.id) {
        // Get global options if present as query params
        var globalOptions = browseCollection.getGlobalOptions($scope);

        var query = {
            type: $scope.section,
            id: $scope.id,
            fields: 'id,name,entries.graph,entries.options,entries.attributes,options,alias,attributes,parent,template'
        };

        // Always expand collections when browsing
        if ($scope.section == 'collections') {
            query.expand = 1;
        }

        library.get(query, function(data) {
            // Abort display if template requested
            if (data.template) {
                return;
            }

            $scope.id = data.id;
            $scope.alias = data.alias;

            // Set page title
            var title = data.options && data.options.title ? data.options.title : data.name;
            $rootScope.setTitle([title]);

            // Set grid size
            $scope.gridSize = storage.get('browse-grid', $scope.section + '-' + $scope.id,
                data.options && data.options.grid_size ? data.options.grid_size : 1);
            if ($scope.gridSize < 1 || $scope.gridSize > 3) {
                $scope.gridSize = 1;
            }

            // Set default refresh interval
            if (!$scope.refreshInterval) {
                $scope.refreshInterval = data.options && data.options.refresh_interval ?
                    data.options.refresh_interval : null;
            }

            // Get graphs state for folding restore
            var graphsState = storage.get('browse-graph_state', $scope.section + '_' + $scope.id, {});

            if ($scope.section == 'collections') {
                $scope.parentID = data.parent;

                // Fill entries with collection graphs
                var graphs = [],
                    graphsResolve = {};

                angular.forEach(data.entries, function(entry, idx) {
                    if (entry.options && entry.options.enabled === false) {
                        return;
                    }

                    var graph = {
                        index: idx,
                        id: entry.graph,
                        options: angular.extend(entry.options || {}, globalOptions),
                        hidden: false
                    };

                    // Set refresh interval if any (useful when defined in collection)
                    if ($scope.refreshInterval) {
                        graph.options.refresh_interval = $scope.refreshInterval;
                    }

                    var state = graphsState[idx + '_' + entry.graph];
                    if (state && typeof state.folded == 'boolean') {
                        graph.options.folded = state.folded;
                    }

                    // Keep useful graph data
                    if (entry.options && entry.options.title) {
                        graph.title = entry.options.title;
                    }

                    graph.attributes = angular.extend({}, data.attributes, entry.attributes) || null;

                    // Set custom embed path for collection view
                    graph.options.embeddable_path = 'collections/' + $scope.id + '/' + idx;

                    graphs.push(graph);
                });

                $scope.graphs = graphs;
            } else {
                // Set entries to single graph display
                $scope.graphs = [{
                    index: 0,
                    id: $scope.id,
                    options: angular.extend({embeddable_path: 'graphs/' + $scope.id}, globalOptions),
                    hidden: false,
                    title: title
                }];
            }

            $scope.state = stateOK;
        }, function() {
            $scope.state = stateError;
        });
    }

    // Load collections tree
    browseCollection.injectTree($scope);

    // Register scope-specific and global hotkeys
    hotkeys.bindTo($scope).add({
        combo: '/',
        description: 'label.graphs_filter',
        callback: function() { angular.element('#filter input').focus(); }
    });

    globalHotkeys.register($scope);
});
