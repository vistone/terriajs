"use strict";

import classNames from 'classnames';
import React from 'react';

import createReactClass from 'create-react-class';

import PropTypes from 'prop-types';

import defined from 'terriajs-cesium/Source/Core/defined';
import knockout from 'terriajs-cesium/Source/ThirdParty/knockout';
import when from 'terriajs-cesium/Source/ThirdParty/when';

import GeoJsonCatalogItem from '../../Models/GeoJsonCatalogItem';
import ObserveModelMixin from '../ObserveModelMixin';
import WebMapServiceCatalogItem from '../../Models/WebMapServiceCatalogItem';

import RegionTypeParameterEditor from './RegionTypeParameterEditor';
import Styles from './parameter-editors.scss';

const RegionPicker = createReactClass({
    displayName: 'RegionPicker',
    mixins: [ObserveModelMixin],

    propTypes: {
        previewed: PropTypes.object,
        parameter: PropTypes.object
    },

    getInitialState() {
        return {
            autocompleteVisible: false,
            autoCompleteOptions: [],
            displayValue: ""
        };
    },

    componentWillMount() {
        this._loadingRegionProvider = undefined;
        this._selectedRegionCatalogItem = undefined;
        this._regionNames = [];
        this._regionsCatalogItem = undefined;
        this.regionProvider = undefined;
        this._subscriptions = [];
        this._lastFeature = undefined;
        this._lastPickedFeatures = undefined;

        knockout.defineProperty(this, 'regionProvider', {
            get: function() {
                return this.props.parameter.regionProvider;
            }
        });

        this._subscriptions.push(knockout.getObservable(this, 'regionProvider').subscribe(this.addRegionLayer));

        knockout.defineProperty(this, 'regionValue', {
            get: function() {
                return this.props.parameter.value;
            },
            set: function(value) {
                if (defined(value) && defined(value.realRegion)) {
                    value = value.realRegion;
                }
                this.props.parameter.value = value;
            }
        });

        const that = this;
        knockout.getObservable(this.props.previewed.terria.mapInteractionModeStack[0], 'pickedFeatures').subscribe(function(pickedFeatures) {
            if (!defined(pickedFeatures)) {
                return;
            }
            that._lastPickedFeatures = pickedFeatures;
            when(pickedFeatures.allFeaturesAvailablePromise, function() {
                if (pickedFeatures !== that._lastPickedFeatures || pickedFeatures.features.length === 0) {
                    return;
                }
                that.updateFeature(pickedFeatures.features[0]);
            });
        });

        this.addRegionLayer();
        this.updateMapFromValue();
    },

    componentWillUnmount() {
        this._subscriptions.forEach(subscription => subscription.dispose());
        if (defined(this._regionsCatalogItem)) {
            this._regionsCatalogItem.isEnabled = false;
            this._regionsCatalogItem = undefined;
        }
        if (defined(this._selectedRegionCatalogItem)) {
            this._selectedRegionCatalogItem.isEnabled = false;
            this._selectedRegionCatalogItem = undefined;
        }

    },

    updateFeature(feature) {
        this._lastRegionFeature = feature.data;
        const regionId = feature.properties[this.regionProvider.regionProp];
        this.regionValue = this.props.parameter.findRegionByID(regionId);

        if (defined(this._selectedRegionCatalogItem)) {
            this._selectedRegionCatalogItem.isEnabled = false;
            this._selectedRegionCatalogItem = undefined;
        }

        if (defined(feature.data) && feature.data.type === 'Feature') {
            this._selectedRegionCatalogItem = new GeoJsonCatalogItem(this.props.previewed.terria);
            this._selectedRegionCatalogItem.name = "Selected Polygon";
            this._selectedRegionCatalogItem.data = feature.data;
            this._selectedRegionCatalogItem.isEnabled = true;
            this._selectedRegionCatalogItem.zoomTo();
        }
    },

    addRegionLayer() {
        if (!defined(this.regionProvider)) {
            return;
        }

        if (this.regionProvider === this._loadingRegionProvider) {
            // The region provider hasn't changed.
            return;
        }

        this._loadingRegionProvider = this.regionProvider;

        const that = this;
        when.all([that.regionProvider.loadRegionIDs(), that.regionProvider.loadRegionNames()]).then(function() {
            if (that.regionProvider !== that._loadingRegionProvider) {
                return;
            }
            that._regionNames = that.regionProvider.regionNames;

            if (defined(that._regionsCatalogItem)) {
                that._regionsCatalogItem.isEnabled = false;
                that._regionsCatalogItem = undefined;
            }

            that._regionsCatalogItem = new WebMapServiceCatalogItem(that.props.previewed.terria);
            that._regionsCatalogItem.name = "Available Regions";
            that._regionsCatalogItem.url = that.regionProvider.server;
            that._regionsCatalogItem.layers = that.regionProvider.layerName;
            that._regionsCatalogItem.parameters = {
                styles: 'border_black_fill_aqua'
            };
            that._regionsCatalogItem.isEnabled = true;

            that._loadingRegionProvider = undefined;
        });
    },

    updateMapFromValue() {
        if (!defined(this.regionProvider)) {
            return;
        }

        if (defined(this._selectedRegionCatalogItem)) {
            this._selectedRegionCatalogItem.isEnabled = false;
            this._selectedRegionCatalogItem = undefined;
        }

        const value = this.regionValue;
        const terria = this.props.previewed.terria;

        const that = this;
        this.regionProvider.getRegionFeature(terria, value, that._lastRegionFeature).then(function(feature) {
            if (!defined(feature)) {
                return;
            }
            if (defined(that._selectedRegionCatalogItem)) {
                that._selectedRegionCatalogItem.isEnabled = false;
                that._selectedRegionCatalogItem = undefined;
            }

            if (defined(feature) && feature.type === 'Feature') {
                that._selectedRegionCatalogItem = new GeoJsonCatalogItem(that.props.previewed.terria);
                that._selectedRegionCatalogItem.name = "Selected Polygon";
                that._selectedRegionCatalogItem.data = feature;
                that._selectedRegionCatalogItem.isEnabled = true;
                that._selectedRegionCatalogItem.zoomTo();
            }
        }).otherwise(function() {
            if (that.props.parameter.value !== value) {
                // Value has already changed.
                return;
            }

            if (defined(that._selectedRegionCatalogItem)) {
                that._selectedRegionCatalogItem.isEnabled = false;
                that._selectedRegionCatalogItem = undefined;
            }
        });
    },

    textChange(e) {
        // Reset region value
        this.regionValue = undefined;

        if (!defined(e.target.value) || !defined(this.regionProvider)) {
            return;
        }

        // if input is empty
        if (!defined(e.target.value)) {
            this.setState({
                autocompleteVisible: false,
                autoCompleteOptions: []
            });
            return;
        }

        // if has text, populate auto complete
        const result = [];
        const regions = this.regionProvider.regions;
        const regionNames = this._regionNames;
        if (regions && regions.length > 0) {
            for (let i = 0; i < regions.length; i++) {
                const name = regionNames[i];
                if (name && name.toLowerCase().indexOf(e.target.value.toLowerCase()) >= 0) {
                    result.push({
                        name: name,
                        id: regions[i].id,
                        FID: regions[i].FID,
                        realRegion: regions[i]
                    });
                    if (result.length >= 100) {
                        break;
                    }
                }
            }
        }
        this.setState({
            autocompleteVisible: result.length > 0 && result.length <= 100,
            autoCompleteOptions: result
        });
    },

    selectRegion(region) {
        this.regionValue = region;
        // After choosing a region from auto complete
        this.setState({
            autocompleteVisible: false,
            autoCompleteOptions: []
        });
        this.updateMapFromValue();
    },

    render() {
        return (<div className={Styles.parameterEditor}>
                    <RegionTypeParameterEditor
                            previewed={this.props.previewed}
                            parameter={this.props.parameter.regionTypeParameter}
                    />
                    <input className={Styles.field}
                           type="text"
                           autoComplete="off"
                           value={RegionPicker.getDisplayValue(this.regionValue, this.props.parameter)}
                           onChange={this.textChange}
                           placeholder="Region name"
                    />
                    {this.renderOptions()}
                </div>);
    },

    renderOptions() {
        const className = classNames({
            [Styles.autocomplete]: true,
            [Styles.isHidden]: !this.state.autocompleteVisible
        });

        return (
            <ul className={className}>
                {this.state.autoCompleteOptions.map((op, i)=>
                    <li key={i}>
                        <button type='button' className={Styles.autocompleteItem}
                                onClick={this.selectRegion.bind(this, op)}>{op.name}</button>
                    </li>
                )}
            </ul>
        );
    },
});

/**
 * Given a value, return it in human readable form for display.
 * @param {Object} value Native format of parameter value.
 * @return {String} String for display
 */
RegionPicker.getDisplayValue = function(region, parameter) {
    if (!defined(region)) {
        return '';
    }
    const regionProvider = parameter.regionProvider;
    let val = '';
    const index = regionProvider.regions.indexOf(region);
    if (index >= 0 && regionProvider.regionNames[index]) {
        val = regionProvider.regionNames[index];
    } else {
        val = region.id;
    }
    if (!defined(val)) {
        return '';
    }
    return regionProvider.regionType + ": " + val;

};

module.exports = RegionPicker;
