/*
 Copyright 2017 Esri

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

define([
  "calcite",
  "dojo/_base/declare",
  "ApplicationBase/ApplicationBase",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/_base/Color",
  "dojo/colors",
  "dojo/dom-construct",
  "esri/identity/IdentityManager",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/portal/Portal",
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/Layer",
  "esri/layers/GroupLayer",
  "esri/layers/GraphicsLayer",
  "esri/layers/ImageryLayer",
  "esri/layers/support/MosaicRule",
  "esri/geometry/Extent",
  "esri/geometry/Polygon",
  "esri/geometry/geometryEngine",
  "esri/Graphic",
  "esri/symbols/WebStyleSymbol",
  "esri/widgets/Home",
  "esri/widgets/Swipe",
  "esri/widgets/Search",
  "esri/widgets/Legend",
  "esri/widgets/ScaleBar",
  "esri/widgets/LayerList",
  "esri/widgets/Expand"
], function (calcite, declare, ApplicationBase, i18n, itemUtils, domHelper,
             Color, colors, domConstruct,
             IdentityManager, Evented, watchUtils, promiseUtils,
             Portal, EsriMap, MapView, Layer, GroupLayer, GraphicsLayer,
             ImageryLayer, MosaicRule,
             Extent, Polygon, geometryEngine, Graphic, WebStyleSymbol,
             Home, Swipe, Search, Legend, ScaleBar, LayerList, Expand) {

  return declare([Evented], {

    /**
     *
     */
    constructor: function () {
      this.CSS = {
        loading: "configurable-application--loading"
      };
      this.base = null;

      // CALCITE WEB //
      calcite.init();
    },

    /**
     *
     * @param base
     */
    init: function (base) {
      if (!base) {
        console.error("ApplicationBase is not defined");
        return;
      }
      this.base = base;

      domHelper.setPageLocale(this.base.locale);
      domHelper.setPageDirection(this.base.direction);

      const webMapItems = this.base.results.webMapItems;
      const webSceneItems = this.base.results.webSceneItems;
      const validItems = webMapItems.concat(webSceneItems).map(response => {
        return response.value;
      });
      const firstItem = (validItems && validItems.length) ? validItems[0] : null;
      if (!firstItem) {
        console.error("Could not load an item to display");
        return;
      }

      this.base.config.title = (this.base.config.title || itemUtils.getItemTitle(firstItem));
      domHelper.setPageTitle(this.base.config.title);

      const viewProperties = itemUtils.getConfigViewProperties(this.base.config);
      viewProperties.container = "view-container";
      viewProperties.constraints = {snapToZoom: false};

      const portalItem = this.base.results.applicationItem.value;
      const appProxies = (portalItem && portalItem.appProxies) ? portalItem.appProxies : null;

      itemUtils.createMapFromItem({item: firstItem, appProxies: appProxies}).then(map => {
        viewProperties.map = map;
        itemUtils.createView(viewProperties).then(view => {
          view.when(() => {
            this.viewReady(this.base.config, firstItem, view).then(() => {
              document.body.classList.remove(this.CSS.loading);
            });
          });
        });
      });
    },

    /**
     *
     * @param config
     * @param item
     * @param view
     */
    viewReady: function (config, item, view) {

      // TITLE //
      document.getElementById("app-title-node").innerHTML = config.title;

      // USER SIGN IN //
      return this.initializeUserSignIn().catch(console.warn).then(() => {

        // SEARCH //
        const search = new Search({view: view, searchTerm: this.base.config.search || ""});
        const searchExpand = new Expand({
          view: view,
          content: search,
          expanded: false,
          expandIconClass: "esri-icon-search",
          expandTooltip: "Search"
        });
        view.ui.add(searchExpand, {position: "top-left", index: 0});

        this.getPlaceName = () => {
          return search.activeSource.locator.locationToAddress({location: view.center}).then(addressCandidate => {
            return addressCandidate.address;
          });
        };

        // HOME //
        const home = new Home({view: view});
        view.ui.add(home, {position: "top-left", index: 1});

        const scalebar = new ScaleBar({view: view, unit: "dual"});
        view.ui.add(scalebar, {position: "bottom-left", index: 0});

        // view.watch('scale', scale => {
        //   console.info(scale, scale.toFixed(0))
        // })

        // APPLICATION READY //
        this.applicationReady(view);

      });

    },

    /**
     *
     * @returns {*}
     */
    initializeUserSignIn: function () {

      const checkSignInStatus = () => {
        return IdentityManager.checkSignInStatus(this.base.portal.url).then(userSignIn).catch(userSignOut).then();
      };
      IdentityManager.on("credential-create", checkSignInStatus);

      // SIGN IN NODE //
      // const signInNode = document.getElementById("sign-in-node");
      // const userNode = document.getElementById("user-node");

      // UPDATE UI //
      const updateSignInUI = () => {
        if (this.base.portal.user) {
          document.getElementById("user-firstname-node").innerHTML = this.base.portal.user.fullName.split(" ")[0];
          document.getElementById("user-fullname-node").innerHTML = this.base.portal.user.fullName;
          document.getElementById("username-node").innerHTML = this.base.portal.user.username;
          document.getElementById("user-thumb-node").src = this.base.portal.user.thumbnailUrl;
          // signInNode.classList.add('hide');
          // userNode.classList.remove('hide');
        } else {
          // signInNode.classList.remove('hide');
          // userNode.classList.add('hide');
        }
        return promiseUtils.resolve();
      };

      // SIGN IN //
      const userSignIn = () => {
        this.base.portal = new Portal({url: this.base.config.portalUrl, authMode: "immediate"});
        return this.base.portal.load().then(() => {
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).catch(console.warn).then();
      };

      // SIGN OUT //
      const userSignOut = () => {
        IdentityManager.destroyCredentials();
        this.base.portal = new Portal({});
        return this.base.portal.load().then(() => {
          this.base.portal.user = null;
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).catch(console.warn).then();

      };

      // USER SIGN IN //
      // signInNode.addEventListener("click", userSignIn);

      // SIGN OUT NODE //
      // const signOutNode = document.getElementById("sign-out-node");
      // if(signOutNode){
      //   signOutNode.addEventListener("click", userSignOut);
      // }

      return checkSignInStatus();
    },

    /**
     *
     * @param view
     */
    initializeViewLoading: function (view) {

      // LOADING //
      const updating_node = domConstruct.create("div", {className: "view-loading-node loader"});
      domConstruct.create("div", {className: "loader-bars"}, updating_node);
      domConstruct.create("div", {className: "loader-text font-size--3 text-white", innerHTML: "Updating..."}, updating_node);
      view.ui.add(updating_node, "bottom-right");
      watchUtils.init(view, "updating", (updating) => {
        updating_node.classList.toggle("is-active", updating);
      });

    },

    /**
     * APPLICATION READY
     *
     * @param view
     */
    applicationReady: function (view) {

      const appDialogHandle = this.initializeAppDetailsDialog();

      this.initDateTimeFormatter();

      this.initializeContextLayers(view).then(({wdpaLayer, worldPopLayer, croplandsLayer}) => {
        this.initializeHotSpots(view).then(({hotSpotsLayer}) => {
          this.initializeImageryLayer(view).then(({baseImageryLayer, imageryLayer}) => {

            this.initializeBurnAreasLayer(view).then(() => {

              appDialogHandle.remove();

              //this.initializeBookmarks(view);
              this.initializeViewLoading(view);
              this.initializeOverview(view);
              this.initializeSwipe(view, baseImageryLayer, imageryLayer, hotSpotsLayer, wdpaLayer, worldPopLayer, croplandsLayer);

              // if(this.base.portal.user.username.startsWith("jgrayson")){
              //this.initializeBurnIndex(view, baseImageryLayer);
              // }

            });
          });
        });
      });

    },

    /**
     *
     * @returns {{remove: Function}}
     */
    initializeAppDetailsDialog: function () {

      calcite.bus.emit("modal:open", {id: "app-details-dialog"});

      return {
        remove: () => {

          const appDetailsLoadingLabel = document.getElementById('app-details-loading-label');
          appDetailsLoadingLabel.classList.add('hide');
          const infoDialogContent = document.getElementById('info-dialog-content');
          infoDialogContent.classList.remove('loading');
          const appDetailsOkBtn = document.getElementById('app-details-ok-btn');
          appDetailsOkBtn.classList.remove('btn-disabled');

        }
      };

    },

    /**
     *
     * @param view
     */
    initializeOverview: function (view) {

      const overviewPanel = domConstruct.create("div", {id: 'overview-panel', className: "overview-panel panel panel-dark animate-fade-in hide"});
      view.ui.add(overviewPanel, {position: "top-right", index: 0});

      const locationCIMSymbol = new WebStyleSymbol({styleName: "Esri2DPointSymbolsStyle", name: "tear-pin-2"});
      locationCIMSymbol.fetchSymbol().then(actualSymbol => {
        // CHANGE TEAR PIN FILL SYMBOL TO ORANGE USING CIM COLOR SPECIFICATION //
        actualSymbol.data.symbol.symbolLayers[1].markerGraphics[0].symbol.symbolLayers[1].color = Color.named.orange.concat(255);

        // LOCATION GRAPHIC AND LAYER //
        const locationGraphic = new Graphic({geometry: view.center.clone(), symbol: actualSymbol});
        const locationLayer = new GraphicsLayer({graphics: [locationGraphic]});

        // OVERVIEW MAP //
        const overviewMap = new MapView({
          container: domConstruct.create("div", {className: "overview-container"}, overviewPanel),
          ui: {components: []},
          constraints: {snapToZoom: false},
          map: new EsriMap({basemap: "hybrid", layers: [locationLayer]}),
          zoom: 2.8
        });
        overviewMap.when(() => {
          watchUtils.init(view, "center", center => {
            locationGraphic.geometry = center;
            watchUtils.whenOnce(view, "stationary").then(() => {
              overviewMap.center = center;
            });
          });
        });

      });

    },

    /**
     *
     */
    initDateTimeFormatter: function () {

      this.toUTCDateLabel = (dateTime) => {
        return {
          dateLabel: dateTime.toLocaleString('default', {timeZone: 'UTC', dateStyle: "medium"}),
          label: dateTime.toLocaleString('default', {timeZone: 'UTC', dateStyle: "medium", timeStyle: "short"}),
          query: `${ dateTime.getUTCFullYear() }/${ String(dateTime.getUTCMonth() + 1).padStart(2, "0") }/${ String(dateTime.getUTCDate()).padStart(2, "0") }`
        };
      };

    },

    /**
     *
     * @param view
     * @returns {*}
     */
    initializeContextLayers: function (view) {
      return promiseUtils.create((resolve, reject) => {

        //
        // PROTECTED AREAS LAYER //
        //
        const wdpaLayer = view.map.layers.find(layer => { return (layer.title === "Protected Areas"); });
        wdpaLayer.load().then(() => {

          //
          // WORLD POP LAYER //
          //
          const worldPopLayer = view.map.layers.find(layer => { return (layer.title === "Population Estimate"); });
          worldPopLayer.load().then(() => {

            //
            // CROPLANDS LAYER //
            //
            const croplandsLayer = view.map.layers.find(layer => { return (layer.title === "Croplands"); });
            croplandsLayer.load().then(() => {

              const croplandsValues = [
                "Cropland, rainfed",                        // 10 //
                "Cropland, rainfed - Herbaceous cover",     // 11 //
                "Cropland, rainfed - Tree or shrub cover",  // 12 //
                "Cropland irrigated or post-flooding",      // 20 //
                "Mosaic cropland (>50%) / natural vegetation (Tree, shrub, herbaceous cover) (<50%)", // 30 //
                "Mosaic natural vegetation (Tree, shrub, herbaceous cover) (>50%) / cropland (<50%)"  // 40 //
              ];
              croplandsLayer.renderer.uniqueValueInfos = croplandsLayer.renderer.uniqueValueInfos.filter(uvInfo => {
                return croplandsValues.includes(uvInfo.value);
              });

              resolve({
                wdpaLayer: wdpaLayer,
                worldPopLayer: worldPopLayer,
                croplandsLayer: croplandsLayer
              });
            });
          });
        });

      });
    },

    /**
     *
     * @param view
     */
    initializeHotSpots: function (view) {
      return promiseUtils.create((resolve, reject) => {

        //
        // HOTSPOT LAYER //
        //
        const hotSpotLabel = document.getElementById("hotspot-count-label");
        const hotSpotDatesLabel = document.getElementById("hotspot-dates-range-label");

        const hotSpotsLocalLayer = view.map.allLayers.find(layer => { return (layer.title === "MODIS Thermal Activity"); });
        hotSpotsLocalLayer.load().then(() => {
          hotSpotsLocalLayer.set({outFields: ["*"]});
          view.whenLayerView(hotSpotsLocalLayer).then(hotSpotsLocalLayerView => {

            const hotSpotsLayer = view.map.layers.find(layer => { return (layer.title === "MODIS Global Thermal Activity"); });
            hotSpotsLayer.load().then(() => {
              hotSpotsLayer.set({outFields: ["*"]});
              view.whenLayerView(hotSpotsLayer).then(hotSpotsLayerView => {

                const legend = new Legend({
                  container: "hotspot-legend-node",
                  view: view,
                  respectLayerVisibility: false,
                  style: {type: "card", layout: "side-by-side"},
                  layerInfos: [{layer: hotSpotsLayer}]
                });

                const emptyLabel = `--- --, ----`;
                const setDatesLabel = (min, max) => {
                  if (min === max) {
                    return `<span>${ min || emptyLabel }</span>`;
                  } else {
                    return `<span>${ min || emptyLabel }</span><span>&nbsp;to&nbsp;</span><span>${ max || emptyLabel }</span>`;
                  }
                };

                const getHotspotCount = promiseUtils.debounce(() => {
                  return promiseUtils.create((resolve, reject) => {
                    const layerView = hotSpotsLayerView.suspended ? hotSpotsLocalLayerView : hotSpotsLayerView;
                    watchUtils.whenFalseOnce(layerView, "updating", () => {

                      const statsQuery = layerView.createQuery();
                      statsQuery.set({
                        outFields: ["ACQ_DATE"],
                        geometry: view.extent,
                        outStatistics: [
                          {
                            statisticType: "count",
                            onStatisticField: "ACQ_DATE",
                            outStatisticFieldName: "count"
                          },
                          {
                            statisticType: "min",
                            onStatisticField: "ACQ_DATE",
                            outStatisticFieldName: "min_date"
                          },
                          {
                            statisticType: "max",
                            onStatisticField: "ACQ_DATE",
                            outStatisticFieldName: "max_date"
                          }
                        ]
                      });

                      layerView.queryFeatures(statsQuery).then(fs => {
                        resolve(fs.features[0].attributes);
                      }).catch(reject);
                    });
                  });
                });

                // CALC HOT SPOTS COUNT WHEN VIEW IS STATIONARY //
                watchUtils.init(view, "stationary", stationary => {
                  if (stationary) {

                    /* Promise.all([
                     watchUtils.whenFalseOnce(hotSpotsLayerView, "updating"),
                     watchUtils.whenFalseOnce(hotSpotsLocalLayerView, "updating")
                     ]).then(() => {*/

                    //const layerView = hotSpotsLayerView.suspended ? hotSpotsLocalLayerView : hotSpotsLayerView;
                    //watchUtils.whenFalseOnce(layerView, "updating", () => {

                    hotSpotDatesLabel.innerHTML = setDatesLabel();

                    getHotspotCount().then(hotSpotsStats => {
                      hotSpotLabel.innerHTML = hotSpotsStats.count.toLocaleString();
                      if (hotSpotsStats.count != null) {
                        const beforeLabel = this.toUTCDateLabel(new Date(hotSpotsStats.min_date)).dateLabel;
                        const afterLabel = this.toUTCDateLabel(new Date(hotSpotsStats.max_date)).dateLabel;
                        hotSpotDatesLabel.innerHTML = setDatesLabel(beforeLabel, afterLabel);
                      } else {
                        hotSpotDatesLabel.innerHTML = setDatesLabel();
                      }
                    }).catch(error => {
                      if (error.name !== 'AbortError') { console.error(error); }
                    });

                    /*layerView.queryFeatures(statsQuery).then(fs => {
                     const hotSpotsStats = fs.features[0].attributes;
                     hotSpotLabel.innerHTML = hotSpotsStats.count.toLocaleString();
                     if(hotSpotsStats.count){
                     const beforeLabel = this.toUTCDateLabel(new Date(hotSpotsStats.min_date)).dateLabel;
                     const afterLabel = this.toUTCDateLabel(new Date(hotSpotsStats.max_date)).dateLabel;
                     hotSpotDatesLabel.innerHTML = setDatesLabel(beforeLabel, afterLabel);
                     } else {
                     hotSpotDatesLabel.innerHTML = setDatesLabel();
                     }
                     });*/
                    //});
                    //});

                  } else {
                    hotSpotLabel.innerHTML = "---";
                    hotSpotDatesLabel.innerHTML = setDatesLabel();
                  }
                });

                resolve({hotSpotsLayer});
              });
            });
          });
        });

      });
    },

    /**
     *  Sentinel-2 Imagery: Color Infrared with DRA
     *  - http://www.arcgis.com/home/item.html?id=2658178ff00e440aae303452bfcec6cf
     *
     *  Landsat 8 Imagery: Color Infrared with DRA
     *  - https://arcgis-content.maps.arcgis.com/home/item.html?id=ff79a3e9dda34260b3ac412033738915
     *
     * @param view
     */
    initializeImageryLayer: function (view) {

      //
      // DATE RANGES //
      //
      const dateRangeNode = document.getElementById("dates-range-label");
      const datesListNode = document.getElementById("imagery-dates-list");

      const imageryLayerInfos = {
        "landsat8": {
          startDateInfo: {year: 2013, month: 2, day: 11},
          layerTitle: "Landsat 8",
          oidField: "OBJECTID",
          bestField: "Best",
          categoryField: "Category",
          acquisitionDateField: "AcquisitionDate",
          cloudCoverField: "CloudCover"
        },
        "sentinel2": {
          startDateInfo: {year: 2015, month: 6, day: 23},
          layerTitle: "Sentinel-2",
          oidField: "objectid",
          bestField: "best",
          categoryField: "category",
          acquisitionDateField: "acquisitiondate",
          cloudCoverField: "cloudcover"
        }
      };
      // LAYER INFO //
      //   NOTE: LANDSAT LAYERS REMOVED FROM WEBMAP //
      const imageryLayerInfo = imageryLayerInfos.sentinel2;

      // IMAGERY LAYER //
      const imageryLayer = view.map.layers.find(layer => {
        return (layer.title === imageryLayerInfo.layerTitle);
      });
      return imageryLayer.load().then(() => {
        imageryLayer.definitionExpression = null;
        imageryLayer.visible = true;

        return view.whenLayerView(imageryLayer).then(imageryLayerView => {

          // BASE IMAGERY LAYER //
          const baseImageryLayer = view.map.layers.find(layer => {
            return (layer.title === `${ imageryLayerInfo.layerTitle } [base]`);
          });
          return baseImageryLayer.load().then(() => {
            baseImageryLayer.definitionExpression = null;
            baseImageryLayer.visible = true;  // NOTE: base imagery visibility... //

            const cloudCoverSelect = document.getElementById("cloud-cover-select");
            let maxCloudCover = cloudCoverSelect.value;
            cloudCoverSelect.addEventListener("change", () => {
              maxCloudCover = cloudCoverSelect.value;
              updateImageryDatesList();
            });

            const emptyLabel = `--- --, ---- --:-- --`;

            const getAllImageryDates = () => {

              dateRangeNode.innerHTML = emptyLabel;
              return imageryLayer.queryRasters({
                returnGeometry: false,
                geometry: view.extent.center,
                where: `(${ imageryLayerInfo.categoryField } = 1) AND (${ imageryLayerInfo.cloudCoverField } <= ${ maxCloudCover })`,
                returnDistinctValues: true,
                outFields: [imageryLayerInfo.acquisitionDateField],
                orderByFields: [`${ imageryLayerInfo.acquisitionDateField } DESC`]
              }).then(datesFS => {

                const datesByValueOf = datesFS.features.reduce((list, feature) => {
                  const imageryDate = new Date(feature.attributes[imageryLayerInfo.acquisitionDateField]);
                  imageryDate.setUTCSeconds(0, 0);
                  return list.has(imageryDate.valueOf()) ? list : list.set(imageryDate.valueOf(), imageryDate);
                }, new Map());

                const datesList = Array.from(datesByValueOf.values());

                return {
                  timeExtent: {start: datesList[datesList.length - 1], end: datesList[0]},
                  datesList: datesList
                };
              });
            };

            const updateImageryDate = (imageryDate) => {
              if (imageryDate) {
                dateRangeNode.innerHTML = this.toUTCDateLabel(imageryDate).label;
                updateImageryFilter(imageryDate);
                document.querySelectorAll(".imagery-date").forEach(node => {
                  node.classList.remove("selected");
                });
                document.getElementById(`imagery-date-${ imageryDate.valueOf() }`).classList.add("selected");
              } else {
                dateRangeNode.innerHTML = emptyLabel;
                datesListNode.innerHTML = "";
              }
            };

            const updateDatesList = (datesList) => {

              const previousSelection = document.querySelector('.imagery-date.selected');
              const previousImageryDateValue = previousSelection ? previousSelection.dataset.imagerydatevalue : null;

              datesListNode.innerHTML = "";
              datesList.forEach(imageryDate => {
                const imageryDateNode = domConstruct.create("div", {
                  id: `imagery-date-${ imageryDate.valueOf() }`,
                  "data-imagerydatevalue": imageryDate.valueOf(),
                  className: "side-nav-link imagery-date",
                  innerHTML: this.toUTCDateLabel(imageryDate).label
                }, datesListNode);
                imageryDateNode.addEventListener("click", () => {
                  updateImageryDate(imageryDate);
                });

                if (imageryDate.valueOf() === +previousImageryDateValue) {
                  dateRangeNode.innerHTML = this.toUTCDateLabel(imageryDate).label;
                  imageryDateNode.classList.add("selected");
                }
              });
            };

            const updateImageryDatesList = () => {
              if (imageryLayerView.suspended) {
                updateImageryDate();
              } else {
                getAllImageryDates().then(datesInfo => {
                  updateDatesList(datesInfo.datesList);
                  if (document.querySelectorAll(".imagery-date.selected").length === 0) {
                    updateImageryDate(datesInfo.timeExtent.end);
                  }
                });
              }
            };

            // DATE(S) OF LATEST IMAGERY FOR CURRENT VIEW EXTENT //
            watchUtils.init(view, "stationary", stationary => {
              if (stationary) {
                updateImageryDatesList();
              }
            });

            const updateImageryFilter = (sortDateTime) => {

              const cloudFreeMosaicRule = new MosaicRule({
                sortField: imageryLayerInfo.acquisitionDateField,
                sortValue: this.toUTCDateLabel(sortDateTime).query,
                ascending: true,
                operation: "first",
                method: "attribute",
                where: `(${ imageryLayerInfo.categoryField } = 1) AND (${ imageryLayerInfo.cloudCoverField } <= ${ maxCloudCover })`
              });
              // AND (${imageryLayerInfo.acquisitionDateField} <= date '${this.toUTCDateLabel(sortDateTime).query}')

              imageryLayer.mosaicRule = cloudFreeMosaicRule;
              baseImageryLayer.mosaicRule = cloudFreeMosaicRule;
            };
            updateImageryFilter(new Date());

            return {baseImageryLayer: baseImageryLayer, imageryLayer: imageryLayer};

          });
        });
      });

    },

    /**
     *
     * @param view
     * @param hotSpotsLayer
     * @param baseImageryLayer
     * @param imageryLayer
     * @param wdpaLayer
     * @param worldPopLayer
     * @param croplandsLayer
     */
    initializeSwipe: function (view, baseImageryLayer, imageryLayer, hotSpotsLayer, wdpaLayer, worldPopLayer, croplandsLayer) {

      //
      // LAYER LIST //
      //
      const layerList_layerIDs = [wdpaLayer.id, worldPopLayer.id, croplandsLayer.id];
      const layerList = new LayerList({
        container: "layers-list-node",
        view: view,
        listItemCreatedFunction: evt => {
          if (layerList_layerIDs.includes(evt.item.layer.id)) {
            evt.item.layer.listMode = "show";
            evt.item.panel = {content: "legend", open: evt.item.layer.visible};
            if (evt.item.layer.portalItem != null) {
              evt.item.actionsSections = [[{id: "layer-details", title: "View details...", className: "esri-icon-description"}]];
            }
          } else {
            evt.item.layer.listMode = "hide";
          }
        }
      });

      const publicItemTitleToSourceItemId = {
        'Protected Areas': 'ae78aeb913a343d69e950b53e29076f7',
        'Population Estimate': '8c2db10c952e45b68efdfc78f64267b0',
        'Croplands': '1453082255024699af55c960bc3dc1fe'
      };

      layerList.on("trigger-action", evt => {
        const sourceItemId = publicItemTitleToSourceItemId[evt.item.layer.title];
        window.open(`https://www.arcgis.com/home/item.html?id=${ sourceItemId }`);
        //window.open(`https://www.arcgis.com/home/item.html?id=${evt.item.layer.portalItem.id}`);
      });

      //
      // SWIPE //
      //
      const swipe = new Swipe({
        view: view,
        leadingLayers: [baseImageryLayer, wdpaLayer, worldPopLayer, croplandsLayer], // , wdpaLayer, worldPopLayer, croplandsLayer
        trailingLayers: [imageryLayer],
        mode: "horizontal",
        position: 75
      });
      view.ui.add(swipe);

      watchUtils.whenEqualOnce(swipe.viewModel, "state", "ready").then(() => {
        setTimeout(() => {
          // GET SWIPE CONTAINER //
          const swipeContainer = document.querySelector(".esri-swipe__container");

          // ADD SWIPE LABEL CONTAINER //
          const swipeLabelContainer = domConstruct.create("div", {
            className: "swipe-label-container font-size--3 animate-fade-in"
          }, swipeContainer, "after");

          // LEADING LABEL //
          const swipeLabelLeading = domConstruct.create("div", {
            className: "swipe-label swipe-label-leading panel-dark icon-ui-checkbox-checked",
            title: "Natural Color bands red, green, blue (4, 3, 2) displayed with dynamic range adjustment applied.",
            innerHTML: "Natural Color"
          }, swipeLabelContainer);
          swipeLabelLeading.addEventListener("click", evt => {
            evt.stopPropagation();
            swipeLabelLeading.classList.toggle("icon-ui-checkbox-checked");
            swipeLabelLeading.classList.toggle("icon-ui-checkbox-unchecked");
            baseImageryLayer.visible = (!baseImageryLayer.visible);
          });

          // TRAILING LABELS //
          const swipeLabelTrailing = domConstruct.create("div", {
            className: "swipe-label swipe-label-trailing panel-dark tooltip tooltip-multiline tooltip-below",
            "aria-label": "Bands shortwave infrared-2, shortwave infrared-1, red (12, 11, 4) with dynamic range adjustment applied.",
            innerHTML: "Short-wave Infrared"
          }, swipeLabelContainer);

          // UPDATE POSITION //
          watchUtils.init(swipe, "position", position => {
            swipeLabelContainer.style.left = `${ position }%`;
          });
        }, 2000);
      });

      //
      // ZOOM-IN MESSAGE PANEL //
      //
      const zoomInMessagePane = document.getElementById("zoomin-panel");
      view.ui.add(zoomInMessagePane);
      zoomInMessagePane.classList.toggle("animate-fade-out");
      zoomInMessagePane.classList.toggle("hide");

      const overviewPanel = document.getElementById('overview-panel');

      //
      // TOGGLE SWIPE WHEN BASE LAYER IS VISIBLE //
      //
      view.whenLayerView(imageryLayer).then(imageryLayerView => {
        watchUtils.init(imageryLayerView, "suspended", suspended => {

          swipe.position = suspended ? 100 : 75;
          swipe.disabled = suspended;
          swipe.container.classList.toggle("hide", suspended);
          overviewPanel.classList.toggle("hide", suspended);

          zoomInMessagePane.classList.toggle("animate-fade-out", !suspended);
          zoomInMessagePane.classList.toggle("animate-fade-in", suspended);
          this.emit("suspended-change", {suspended: suspended});
        });

        //
        // AUTO SWIPE
        //
        let autoSwipe = false;
        let direction = 1;
        const _swipeIt = () => {
          direction = (swipe.position > 75) ? -1 : ((swipe.position < 25) ? 1 : direction);
          swipe.position += (0.1 * direction);

          if (autoSwipe && (!imageryLayerView.suspended)) {
            setTimeout(() => {
              requestAnimationFrame(_swipeIt);
            }, (1000 / 128));
          }
        };

        const autoSwipeBtn = document.getElementById("auto-swipe-btn");
        autoSwipeBtn.addEventListener("click", () => {
          autoSwipeBtn.classList.toggle("icon-ui-play");
          autoSwipeBtn.classList.toggle("icon-ui-pause");
          autoSwipe = autoSwipeBtn.classList.contains("icon-ui-pause");
          if (autoSwipe) {
            requestAnimationFrame(_swipeIt);
          }
        });

        this.on("suspended-change", ({suspended}) => {
          if (autoSwipe) {
            autoSwipeBtn.classList.toggle("icon-ui-play", suspended);
            autoSwipeBtn.classList.toggle("icon-ui-pause", !suspended);
            if (suspended) {
              autoSwipe = false;
            }
          }
          autoSwipeBtn.classList.toggle("btn-disabled", suspended);

        });

      });

    },

    /**
     *
     * @param view
     */
    initializeBurnAreasLayer: function (view) {
      return promiseUtils.create((resolve, reject) => {

        const burnAreasToggle = document.getElementById('burn-areas-toggle');

        const burnAreaLayer = view.map.layers.find(layer => { return (layer.title === "Burn Area Analysis"); });
        burnAreaLayer.load().then(() => {
          burnAreaLayer.outFields = ["*"];

          view.whenLayerView(burnAreaLayer).then(burnAreaLayerView => {

            burnAreasToggle.addEventListener('click', () => {
              burnAreasToggle.classList.toggle('esri-icon-non-visible');
              burnAreaLayer.visible = burnAreasToggle.classList.toggle('esri-icon-visible');
            });

            //burnAreaLayer.title = "Burn Areas";
            const objectIdField = burnAreaLayer.objectIdField;
            //console.info(burnAreaLayer.definitionExpression);

            const defaultQueryParams = {
              outFields: burnAreaLayerView.availableFields,
              where: burnAreaLayer.definitionExpression, // "1=1", //"(CONFIDENCE > 0) AND (FRP > 0)",
              returnGeometry: true,
              orderByFields: ['latest_detect_time DESC'],
              maxRecordCountFactor: 5
            };

            // const burnAreasQuery = burnAreaLayer.createQuery();
            // burnAreasQuery.set(defaultQueryParams);
            // burnAreaLayer.queryFeatures(burnAreasQuery).then(burnAreasFS => {
            //this.initializeBurnAreaList(view, burnAreasFS.features, objectIdField).then(() => {
            this.initializeBurnAreaList(view, [], objectIdField).then(() => {
              const getBurnAreaOIDs = promiseUtils.debounce(() => {
                return promiseUtils.create((resolve, reject) => {
                  if (burnAreaLayer.visible) {
                    // watchUtils.whenFalseOnce(burnAreaLayerView, 'updating', () => {

                    const burnAreasQuery = burnAreaLayer.createQuery();
                    burnAreasQuery.set({
                      ...defaultQueryParams,
                      geometry: view.extent //.clone().expand(1.5)
                    });
                    //burnAreaLayerView.queryObjectIds(burnAreasQuery).then(resolve).catch(reject);

                    burnAreaLayer.queryFeatures(burnAreasQuery).then(burnAreasFS => {
                      //const aoiOIDs = burnAreasFS.features.map(f => f.attributes[objectIdField]);
                      resolve(burnAreasFS.features);
                    }).catch(reject);

                    // });
                  } else {
                    resolve([]);
                  }
                });
              });

              const updateBurnAreaList = () => {
                getBurnAreaOIDs().then((burnAreaFeatures) => {
                  this.updateBurnAreaNodes(burnAreaFeatures);
                  //this.filterBurnAreaNodes(aoiOIDs);
                }).catch(error => {
                  if (error.name !== 'AbortError') { console.error(error); }
                });
              };

              watchUtils.init(view, 'stationary', stationary => {
                if (stationary) {
                  updateBurnAreaList();
                }
              });

              burnAreaLayer.watch('visible', visible => {
                updateBurnAreaList();
              });

              resolve();

            }).catch(reject);
            //}).catch(reject);
          });
        });
      });
    },

    /**
     *
     * @param view
     * @param burnAreaFeatures
     * @param objectIdField
     * @returns {Promise}
     */
    initializeBurnAreaList: function (view, burnAreaFeatures, objectIdField) {
      return promiseUtils.create((resolve, reject) => {

        const defaultExtent = view.extent.clone();

        /*
         OBJECTID: 6094
         Shape__Area: 9833046.57470703
         Shape__Length: 16799.1842080462
         clusterid: 990
         confidence: "nominal"
         first_detect_time: 1600300080000
         frp: 133.516666666667
         latest_detect_time: 1600300080000
         name: null
         status: "Active"
         */

        // const popEstFormatter = new Intl.NumberFormat('default', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        const acresFormatter = new Intl.NumberFormat('default', {minimumFractionDigits: 1, maximumFractionDigits: 1});
        const dayFormatter = new Intl.DateTimeFormat('default', {year: 'numeric', month: 'short', day: 'numeric'});

        const dataList = document.getElementById('data-list');
        const createBurnAreaNode = (burnAreaFeature) => {
          const atts = burnAreaFeature.attributes;

          const oid = atts[objectIdField];
          const firstDetectedDate = new Date(atts.first_detect_time);
          const lastDetectedDate = new Date(atts.latest_detect_time);
          const burntAcres = atts.area_acres;

          const burnAreaNode = domConstruct.create('div', {
            id: `burn-area-${ oid }`,
            'data-oid': oid,
            className: "burn-area-node side-nav-link"
          }, dataList);

          const topNode = domConstruct.create('div', {
            className: ' content-row'
          }, burnAreaNode);

          domConstruct.create('div', {
            className: 'font-size-0',
            innerHTML: dayFormatter.format(lastDetectedDate)
          }, topNode);

          domConstruct.create('div', {
            className: 'font-size--3 avenir-italic text-gray',
            innerHTML: atts.region
          }, topNode);

          domConstruct.create('div', {
            className: 'font-size--2',
            innerHTML: `acres:&nbsp;${ acresFormatter.format(burntAcres) }&nbsp;&nbsp;|&nbsp;&nbsp;frp:&nbsp;${ atts.frp.toFixed(1) }&nbsp;&nbsp;|&nbsp;&nbsp;confidence:&nbsp;${ atts.confidence }`
          }, burnAreaNode);
          // status: ${atts.status}&nbsp;&nbsp;|&nbsp;&nbsp;

          burnAreaNode.addEventListener('click', () => {
            dataList.querySelectorAll(`.burn-area-node:not(#burn-area-${ oid })`).forEach(node => {
              node.classList.remove('selected');
            });

            if (burnAreaNode.classList.toggle('selected')) {
              view.goTo({
                target: burnAreaFeature.geometry.centroid,
                scale: 100000
              });
            } else {
              view.goTo({target: defaultExtent});
            }

          });
        };

        // const burnAreaByID = new Map();
        // burnAreaByID.set(oid, { feature: burnAreaFeature, node: burnAreaNode });
        //const oid = burnAreaFeature.attributes[objectIdField];
        // burnAreaFeatures.forEach(burnAreaFeature => {
        //   const burnAreaNode = createBurnAreaNode(burnAreaFeature);
        // });

        //burnAreaFeatures.forEach(createBurnAreaNode);

        // this.filterBurnAreaNodes = (aoiOIDs) => {
        //   dataList.querySelectorAll('.burn-area-node').forEach(node => {
        //     node.classList.toggle('hide', !aoiOIDs.includes(Number(node.dataset.oid)));
        //   });
        // }

        this.updateBurnAreaNodes = (burnAreaFeatures) => {

          dataList.querySelectorAll('.burn-area-node').forEach(node => {
            node.classList.add('hide');
          });

          burnAreaFeatures.forEach(burnAreaFeature => {
            const oid = burnAreaFeature.attributes[objectIdField];
            const burnAreaNode = document.getElementById(`burn-area-${ oid }`);
            if (burnAreaNode) {
              burnAreaNode.classList.remove('hide');
            } else {
              createBurnAreaNode(burnAreaFeature);
            }
          });

        };

        resolve();
      });
    }

  });
});

