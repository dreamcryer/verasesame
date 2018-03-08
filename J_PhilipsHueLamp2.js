var PhilipsHueLamp2 = (function (api) {
    // unique identifier for this plugin...
    var uuid = 'D99CA776-84F1-11E4-B116-123B93F75CBA';
    var myModule = {};
    
    var MINIMUM_REQUIRED_API_VERSION = 5;

    var SID = 'urn:micasaverde-com:serviceId:PhilipsHue1';
    var HAD = "urn:micasaverde-com:serviceId:HaDevice1";
    var ACTION_SET_COLOR_TEMP = 'SetColorTemperature';
    var ACTION_SET_HUE_AND_SATURATION = 'SetHueAndSaturation';
    var VARIABLE_LAMP_VALUES = 'LampValues';
    var VARIABLE_TRANSITION_TIME = 'TransitionTime';	
    var VARIABLE_LAMP_EFFECT_VALUE = 'LampEffectValue';
    var VARIABLE_DEFAULT_TRANSITION_TIME = 'DefaultTransitionTime';
    var TRANSITION_TIME_MIN = 1;
    var TRANSITION_TIME_MAX = 1000;
    var ACTION_SAVE_PRESET_COLOR = 'SavePresetColor';
    var VARIABLE_COLOR = 'Color';
    var TIMER_READ_STATE_VARIABLES = 10; // in seconds
    var ALLOW_CT_PRESETS = true;
    var DEFAULT_TRANSITION_TIME = 50;
    var CT_PRESETS = [
        {
            "Label": {
                "lang_tag": "ui7_preset_2000k",
                "text": "Warm (2000K)"
            },
            "Value": 493
        },
        {
            "Label": {
                "lang_tag": "ui7_preset_2700k",
                "text": "Warm White (2700K)"
            },
            "Value": 469
        },
        {
            "Label": {
                "lang_tag": "ui7_preset_3000k",
                "text": "Soft White (3000K)"
            },
            "Value": 444
        },
        {
            "Label": {
                "lang_tag": "ui7_preset_3500k",
                "text": "Natural White (3500K)"
            },
            "Value": 403
        },
        {
            "Label": {
                "lang_tag": "ui7_preset_4500k",
                "text": "Soft White (4500K)"
            },
            "Value": 319
        },
        {
            "Label": {
                "lang_tag": "ui7_preset_5000k",
                "text": "Daylight (5000K)"
            },
            "Value": 278
        },
        {
            "Label": {
                "lang_tag": "ui7_preset_6500k",
                "text": "Overcast light (6500K)"
            },
            "Value": 155
        }
    ];

    var deviceId = '';
    var deviceObj = '';
    var deviceParentId = '';
    var selectedHueLights = [];
    var selectedHueDeviceLights = [];
    var hueSceneObj = {};
    var lightList = [];
    var bridgeLightIdToUserDataLightId = null;
    var lightDeviceIdList = [];
    var editedSceneObj = null;
    var bridgeSceneList = [];
    var canvasWidthForSceneActions = 540;
    var sceneActionPickedValues = {

    };

    var colorPickerCalledFrom = '';

    var intervalCheckStateVariables;

    var MyConfig = {
        CANVAS_HOLDER: 'philips_hue_lamp_2_canvas_holder',
        CANVAS_COLOR_TEMP: {
            ID: 'philips_hue_lamp_2_canvas_color_temp',
            WIDTH: 640,
            HEIGHT: 40,
            TOP: 0,
            LEFT: 0
        },
        CANVAS_HUE_SAT: {
            ID: 'philips_hue_lamp_2_canvas_hue_sat',
            WIDTH: 640,
            HEIGHT: 320,
            TOP: 45,
            LEFT: 0
        },
        CANVAS_MARKER: {
            ID: 'philips_hue_lamp_2_canvas_marker',
            WIDTH: 20,
            HEIGHT: 20
        },
        CONTAINER_SET: 'philips_hue_lamp_2_container_set',
        CONTAINER_SELECTED_VALUES: 'philips_hue_lamp_2_container_values',
        CONTAINER_SELECTED_COLOR_TEMPERATURE: 'philips_hue_lamp_2_container_value_color_temp',
        CONTAINER_SELECTED_HUE: 'philips_hue_lamp_2_container_value_hue',
        CONTAINER_SELECTED_SATURATION: 'philips_hue_lamp_2_container_value_saturation',
        CONTAINER_FEEDBACK: 'philips_hue_lamp_2_container_feedback',
        RANGES: {
            ColorTemperature: {
                left: 500,
                right: 153
            },
            Hue: {
                min: 0,
                max: 65535
            },
            Saturation: {
                min: 200,
                max: 255
            }
        },
        BUTTON_SET_VALUES: 'philips_hue_lamp_2_button_set_values',
        LABEL_BUTTON_SET_LAMP: {
            lang_tag: "philips_hue_lamp_2_set_lamp",
            text: "Set Lamp"
        },
        SELECT_COLOR_PRESET: 'philips_hue_lamp_2_select_color_preset',
        LABEL_SELECT_COLOR_PRESET: {
            lang_tag: "philips_hue_lamp_2_select_color_preset",
            text: "-- select --"
        },
        LABEL_COLOR: {
            lang_tag: 'philips_hue_lamp_2_color',
            text: 'Color'
        },
        LABEL_MIN_API_VERSION: {
            lang_tag: 'philips_hue_lamp_2_min_api_version',
            text: 'WARNING ! You are using API version __API_VERSION__. Minimum API version required is ' + MINIMUM_REQUIRED_API_VERSION + ' ! Some things may not work as expected.'
        },
        LABEL_OR: {
            lang_tag: 'philips_hue_lamp_2_or',
            text: 'or'
        },
        LABEL_SUCCESS: {
            lang_tag: 'philips_hue_lamp_2_success',
            text: 'Success'
        },
        LABEL_ERROR: {
            lang_tag: 'philips_hue_lamp_2_error',
            text: 'Error'
        },
        LABEL_SET_A_COLOR_PRESET: {
            lang_tag: 'philips_hue_lamp_2_set_a_color_preset',
            text: 'Set a color preset'
        },
        LABEL_COLOR_TEMPERATURE: {
            lang_tag: 'philips_hue_lamp_2_color_temperature',
            text: 'Color Temperature'
        },
        LABEL_HUE: {
            lang_tag: 'philips_hue_lamp_2_hue',
            text: 'Hue'
        },
        LABEL_SATURATION: {
            lang_tag: 'philips_hue_lamp_2_saturation',
            text: 'Saturation'
        },
        LABEL_EFFECT: {
            lang_tag: 'philips_hue_2_effect',
            text: 'Effect'
        },
        LABEL_EFFECT_NONE: {
            lang_tag: 'philips_hue_2_effect_none',
            text: 'None'
        },
        LABEL_EFFECT_COLOR_LOOP: {
            lang_tag: 'philips_hue_2_effect_color_loop',
            text: 'Color Loop'
        },
        LABEL_TRANSITION_TIME: {
            lang_tag: 'philips_hue_lamp_2_transition_time',
            text: 'Transition time'
        },
        LABEL_TRANSITION_TIME_INVALID_VALUE_ENTERED: {
            lang_tag: 'philips_hue_lamp_2_invalid_transition_time_entered',
            text: 'Invalid value entered for transition time. The default value of __DEFAULT_TRANSITION_TIME_VALUE__ will be used, instead.'
        },
        CONTAINER_SELECT_PRESET: 'philips_hue_lamp_2_container_select_preset',
        BUTTON_SET_PRESET_COLOR: 'philips_hue_lamp_2_button_set_preset_color',
        LABEL_SET_PRESET_COLOR: {
            lang_tag: 'philips_hue_lamp_2_set_preset_color',
            text: 'Set'
        }
    };

    var pickedValues = {
        colorTemperature: -1,
        hue: -1,
        saturation: -1
    };

    function init() {
        // check api version...
        if (typeof api.requiresVersion === 'function') {
            api.requiresVersion(MINIMUM_REQUIRED_API_VERSION, function(version){
                var msg = Utils.getLabel(MyConfig.LABEL_MIN_API_VERSION);
                msg = msg.replace('__API_VERSION__', version);
				console.log(msg);
                //api.showCustomPopup(msg);
            });
        }

        // register to events...
        api.registerEventHandler('on_ui_cpanel_before_close', myModule, 'cleanup');
        deviceId = api.getCpanelDeviceId();
        deviceObj = api.getDeviceObject(deviceId);

        if (typeof intervalCheckStateVariables !== 'undefined') {
            clearInterval(intervalCheckStateVariables);
        }

        // check lightness level change...
        intervalCheckStateVariables = setInterval(function () {
            setLigthnessLevel();
        }, TIMER_READ_STATE_VARIABLES * 1000);
    }

    function cleanup() {
        // perform some cleanup...
        clearInterval(intervalCheckStateVariables);
    }

    function returnHTMLContainer() {
        var labelButtonSetValues = Utils.getLabel(MyConfig.LABEL_BUTTON_SET_LAMP);
        var labelSetPresetColor = Utils.getLabel(MyConfig.LABEL_SET_PRESET_COLOR);
        var labelColorTemperature = Utils.getLabel(MyConfig.LABEL_COLOR_TEMPERATURE);
        var labelHue = Utils.getLabel(MyConfig.LABEL_HUE);
        var labelSaturation = Utils.getLabel(MyConfig.LABEL_SATURATION);
        var labelOr = Utils.getLabel(MyConfig.LABEL_OR);
        var labelSetAColorPreset = Utils.getLabel(MyConfig.LABEL_SET_A_COLOR_PRESET);
        var sceneDeviceName = "";
	   var transitionTimeUpdated = DEFAULT_TRANSITION_TIME;
	   if(api.getDeviceState(api.getCpanelDeviceId(), HAD, VARIABLE_TRANSITION_TIME)){
		 transitionTimeUpdated = api.getDeviceState(api.getCpanelDeviceId(), HAD, VARIABLE_TRANSITION_TIME);
	   }	   
	   console.log("transitionTimeUpdated: ");
	   console.log(transitionTimeUpdated);
	   
        if (colorPickerCalledFrom === "sceneList") {
            sceneDeviceName = hueSceneObj.name;
        } else {
            sceneDeviceName = deviceObj.name;
        }
        var html = '<div class="hueBridgeColorPickerContainer">' +
            //'<div id="newHueSceneName" class="newSceneName">' + sceneDeviceName + '</div>' +
            '<div class="philips_hue_2_lightness_container clearfix">' +
            '   <div class="pull-left philips_hue_2_lightness_label" style="font-weight: bold;">' + Utils.getLabel(MyConfig.LABEL_EFFECT) + ':</div>' +
            '   <div class="pull-left margin_left_5 margin_top_5 customSelectBoxContainer">' +
            '       <select id="philips_hue_lamp_2_effect" class="customSelectBox">' +
            '           <option value="none">'+Utils.getLabel(MyConfig.LABEL_EFFECT_NONE)+'</option>' +
            '           <option value="colorloop">'+Utils.getLabel(MyConfig.LABEL_EFFECT_COLOR_LOOP)+'</option>' +
            '       </select>' +
            '   </div>' +
            '   <div class="pull-left philips_hue_2_lightness_label" style="margin-left: 30px; font-weight: bold;">' + Utils.getLabel(MyConfig.LABEL_TRANSITION_TIME) + ':</div>' +
            '   <div class="pull-left">' +
            '       <input class="device_cpanel_input_text margin_top_5" style="width: 60px; text-align: right;" type="text" id="philips_hue_lamp_2_transition_time" value="'+transitionTimeUpdated+'" />' +
            '   </div>' +
            '   <div class="clearfix"></div>'+
            '</div>' +
            '<div class="luminositySliderContainer clearfix">' +
            '   <div class="pull-left luminositySliderLabel">' + Utils.getLangString("ui7_lightness", "Lightness") + '</div>' +
            '   <div class="pull-left luminosityIntensity" id="luminosityIntensity"></div>' +
            '   <div id="luminositySlider" class="luminositySlider pull-left"></div>' +
            '</div>' +
            '<div style="clear: both; position: relative;">' +
            '<div id="' + MyConfig.CANVAS_HOLDER + '" style="clear: both; z-index: 100; position: relative;">' +
            '   <canvas id="' + MyConfig.CANVAS_COLOR_TEMP.ID + '" width="' + MyConfig.CANVAS_COLOR_TEMP.WIDTH + '" height="' + MyConfig.CANVAS_COLOR_TEMP.HEIGHT + '" style="cursor: crosshair; border-top-left-radius: 5px; border-top-right-radius: 5px;"></canvas>' +
            '   <canvas id="' + MyConfig.CANVAS_HUE_SAT.ID + '" width="' + MyConfig.CANVAS_HUE_SAT.WIDTH + '" height="' + MyConfig.CANVAS_HUE_SAT.HEIGHT + '" style="cursor: crosshair; border-bottom-left-radius: 5px; border-bottom-right-radius: 5px;"></canvas>' +
            '</div>' +
            '<div id="' + MyConfig.CONTAINER_SELECTED_VALUES + '" style="clear: both; height: 25px; line-height: 25px; display: none;">' +
            '       <div style="float: left;">' +
            '           ' + labelColorTemperature + ': <span id="' + MyConfig.CONTAINER_SELECTED_COLOR_TEMPERATURE + '" style="width: 25px; height: 25px; color: #111111;">-</span>' +
            '       </div>' +
            '       <div style="float: left; margin-left: 10px;">' +
            '           ' + labelHue + ': <span id="' + MyConfig.CONTAINER_SELECTED_HUE + '" style="width: 25px; height: 25px; color: #111111;">-</span>' +
            '       </div>' +
            '       <div style="float: left; margin-left: 10px;">' +
            '           ' + labelSaturation + ': <span id="' + MyConfig.CONTAINER_SELECTED_SATURATION + '" style="width: 25px; height: 25px; color: #111111;">-</span>' +
            '       </div>' +
            '</div>' +
            '<div id="' + MyConfig.CONTAINER_SET + '" style="clear: both; display: none; margin-top: 10px;">' +
            '   <div style="clear: both; height: 25px; line-height: 25px;">' +
            '       <input type="button" id="' + MyConfig.BUTTON_SET_VALUES + '" value="' + labelButtonSetValues + '" />' +
            '   </div>' +
            '   <div style="clear: both; height: 25px; line-height: 25px; padding-left: 25px; margin-top: 10px;">' + labelOr + '</div>' +
            '   <div id="' + MyConfig.CONTAINER_SELECT_PRESET + '" style="clear: both; margin-top: 10px;">' +
            '       <div style="float:left;">' + labelSetAColorPreset + ':</div>' +
            '       <div style="float:left; margin-left: 10px;">' +
            returnHTMLSelectForColorPresets() +
            '       </div>' +
            '       <div style="float:left; margin-left: 10px;">' +
            '           <input type="button" id="' + MyConfig.BUTTON_SET_PRESET_COLOR + '" style="display: none;" value="' + labelSetPresetColor + '" />' +
            '       </div>' +
            '       <div style="float:left; margin-left: 25px;" id="' + MyConfig.CONTAINER_FEEDBACK + '"></div>' +
            '   </div>' +
            '</div>' +
            '<canvas id="' + MyConfig.CANVAS_MARKER.ID + '" style="display: none; z-index: 200; position: absolute;" width="' + MyConfig.CANVAS_MARKER.WIDTH + '" height="' + MyConfig.CANVAS_MARKER.HEIGHT + '"></canvas>' +
            '</div>' +
            '<div class="clearfix">' +
            '<button id="finishSaveHueScene" class="setup_wizard_button pull-right flip saveBtn" disabled>' + Utils.getLangString("ui7_general_ucase_finish", "Finish") + '</button>' +
            '</div>' +
            '</div>';

        return html;
    }

    function returnHTMLSelectForColorPresets() {
        var labelSelectPreset = Utils.getLabel(MyConfig.LABEL_SELECT_COLOR_PRESET);
        var labelColor = Utils.getLabel(MyConfig.LABEL_COLOR);

        var html = '<select id="' + MyConfig.SELECT_COLOR_PRESET + '">' +
            '           <option value="0">' + labelSelectPreset + '</option>';

        for (var i = 1; i <= 6; i++) {
            html += '<option value="' + i + '">' + labelColor + i + '</option>';
        }

        html += '</select>';

        return html;
    }

    function getMousePos(canvas, mx, my) {
        var rect = canvas.getBoundingClientRect();
        return {
            x: mx - rect.left,
            y: my - rect.top
        };
    }

    function processClickedValue(retVal, x, y) {
        updateValues(retVal);
        savePickedValues(retVal);
        showMarkerAtMousePosition(retVal, x, y);
        handleOnColorPick();
        sendPickedValues();
        setLuminositySliderColor(retVal);
    }

    function attachCanvasEventHandlers() {
        var $canvases = $('#' + MyConfig.CANVAS_HOLDER).find('canvas');

        $canvases.off('mousemove').on('mousemove', function (e) {
            var retVal = getValuesAtMousePosition(e.clientX, e.clientY);
            updateValues(retVal);
        });

        $canvases.off('mouseout').on('mouseout', function (e) {
            handleMouseOutOfCanvas();
        });

        $canvases.off('click').on('click', function (e) {
            e.stopPropagation();
            var retVal = getValuesAtMousePosition(e.clientX, e.clientY);
            processClickedValue(retVal, e.clientX, e.clientY);
        });
        if (colorPickerCalledFrom === "sceneList") {
            $("#finishSaveHueScene").off().on("click", function () {
                saveHueSceneAndHueLightsColors();
            });
        } else {
            $("#finishSaveHueScene").addClass("hidden");
        }
        $("#luminositySlider").slider({
            range: "min",
            min: 0,
            max: 100,
            value: 50,
            change: function (event, ui) {
                var intensityValue = ui.value + ' %';
                $("#luminosityIntensity").html(intensityValue);
            },
            slide: function (event, ui) {
                var intensityValue = ui.value + ' %';
                $("#luminosityIntensity").html(intensityValue);
            },
            stop: function (event, ui) {
                var intensityValue = ui.value + ' %';
                handlerForSliderLightnessStop(ui.value);
            }
        });
        var sliderValue = $("#luminositySlider").slider("option", "value");
        var intensityValue = sliderValue + ' %';
        $("#luminosityIntensity").html(intensityValue);

    }

    function savePickedValues(val) {
        try {
            pickedValues['colorTemperature'] = -1;
            pickedValues['hue'] = -1;
            pickedValues['saturation'] = -1;
            if (val['colorTemperature'] > -1) {
                pickedValues['colorTemperature'] = val['colorTemperature'];
            }
            if (val['hue'] > -1 && val['saturation'] > -1) {
                pickedValues['hue'] = val['hue'];
                pickedValues['saturation'] = val['saturation'];
            }
        } catch (e) {
            Utils.logError('Error in PhilipsHueLamp2.savePickedValues(): ' + e);
        }
    }

    function handleOnColorPick() {
        var show = false;
        if (pickedValues['colorTemperature'] > -1) {
            $('#' + MyConfig.CONTAINER_SELECTED_HUE).html('-');
            $('#' + MyConfig.CONTAINER_SELECTED_SATURATION).html('-');
            show = true;
        }
        if (pickedValues['hue'] > -1 && pickedValues['saturation'] > -1) {
            $('#' + MyConfig.CONTAINER_SELECTED_COLOR_TEMPERATURE).html('-');
            show = true;
        }
        if (colorPickerCalledFrom === "sceneList") {
            if (show) {
                $("#finishSaveHueScene").attr("disabled", false);
            }
            show = false;
        }
        if (show) {
            //$('#' + MyConfig.CONTAINER_SET).show();
        }
    }

    function getSelectedEffectValue() {
        return $('#philips_hue_lamp_2_effect').val();
    }

    function getTransitionTimeValue() {
        var val = $('#philips_hue_lamp_2_transition_time').val(), parsedVal = Utils.int(val);
        if (isNaN(parsedVal) || parsedVal < TRANSITION_TIME_MIN || parsedVal > TRANSITION_TIME_MAX) {
            var msg = Utils.getLabel(MyConfig.LABEL_TRANSITION_TIME_INVALID_VALUE_ENTERED).replace('__DEFAULT_TRANSITION_TIME_VALUE__', DEFAULT_TRANSITION_TIME);
            api.showCustomPopup(msg, {autoHide: 4});
            return DEFAULT_TRANSITION_TIME;       // the default value
        }

        return parsedVal;
    }

    function sendPickedValues() {
        try {
            var valueForEffect = getSelectedEffectValue(), valueForTransitionTime = getTransitionTimeValue();			
			
            $('#philips_hue_lamp_2_transition_time').val(valueForTransitionTime);
		  if(typeof valueForTransitionTime !== 'undefined' && valueForTransitionTime != DEFAULT_TRANSITION_TIME){			
			api.setDeviceStatePersistent(api.getCpanelDeviceId(), HAD, VARIABLE_TRANSITION_TIME, valueForTransitionTime);
		  }else if(valueForTransitionTime == DEFAULT_TRANSITION_TIME){
			api.setDeviceStatePersistent(api.getCpanelDeviceId(), HAD, VARIABLE_TRANSITION_TIME, '50');  
		  }	
            if (pickedValues['colorTemperature'] > -1) {
                myInterface.showModalLoading();
                api.performLuActionOnDevice(api.getCpanelDeviceId(), SID, ACTION_SET_COLOR_TEMP, {
                    actionArguments: {
                        ColorTemperature: pickedValues['colorTemperature'],
                        Effect: valueForEffect,
                        Transitiontime: valueForTransitionTime
                    },
                    onSuccess: function () {
                        setTimeout(function () {
                            myInterface.hideModalLoading();
                        }, 3000);
                    },
                    onFailure: function () {
                        setTimeout(function () {
                            myInterface.hideModalLoading();
                        }, 3000);
                    }
                });
            }
            if (pickedValues['hue'] > -1 && pickedValues['saturation'] > -1) {
                myInterface.showModalLoading();
                api.performLuActionOnDevice(api.getCpanelDeviceId(), SID, ACTION_SET_HUE_AND_SATURATION, {
                    actionArguments: {
                        Hue: pickedValues['hue'],
                        Saturation: pickedValues['saturation'],
                        Effect: valueForEffect,
                        Transitiontime: valueForTransitionTime
                    },
                    onSuccess: function () {
                        setTimeout(function () {
                            myInterface.hideModalLoading();
                        }, 3000);
                    },
                    onFailure: function () {
                        setTimeout(function () {
                            myInterface.hideModalLoading();
                        }, 3000);
                    }
                });
            }
        } catch (e) {
            Utils.logError('Error in PhilipsHueLamp2.sendPickedValues(): ' + e);
        }
    }

    function setColorPreset(num) {
        try {
            var variableName = VARIABLE_COLOR + '' + num, variableValue;
            if (pickedValues['colorTemperature'] > -1) {
                variableValue = 'ct:' + pickedValues['colorTemperature'];
                api.setDeviceStateVariablePersistent(api.getCpanelDeviceId(), SID, variableName, variableValue, {
                    onSuccess: handleSetColorPresetSuccess,
                    onFailure: handleSetColorPresetFailure
                });
            }
            if (pickedValues['hue'] > -1 && pickedValues['saturation'] > -1) {
                variableValue = 'hue:' + pickedValues['hue'] + ';sat:' + pickedValues['saturation'];
                api.setDeviceStateVariablePersistent(api.getCpanelDeviceId(), SID, variableName, variableValue, {
                    onSuccess: handleSetColorPresetSuccess,
                    onFailure: handleSetColorPresetFailure
                });
            }
        } catch (e) {
            Utils.logError('Error in PhilipsHueLamp2.setColorPreset(): ' + e);
        }
    }

    function updateValues(val) {
        try {
            if (val.colorTemperature > -1) {
                $('#' + MyConfig.CONTAINER_SELECTED_COLOR_TEMPERATURE).html(val.colorTemperature);
            }
            if (val.hue > -1) {
                $('#' + MyConfig.CONTAINER_SELECTED_HUE).html(val.hue);
            }
            if (val.saturation > -1) {
                $('#' + MyConfig.CONTAINER_SELECTED_SATURATION).html(val.saturation);
            }
        } catch (e) {
            Utils.logError('Error in PhilipsHueLamp2.updateValues(): ' + e);
        }
    }

    function fillCanvases(opt) {
        fillColorTempCanvas(opt);

        fillHueSatCanvas();
    }

    function fillColorTempCanvas(opt) {
        try {
            var canvas = $('#' + MyConfig.CANVAS_COLOR_TEMP.ID).get()[0];
            if (typeof canvas != 'undefined' && canvas != null) {
                var context = canvas.getContext('2d');

                // create gradient...
                var gradient = context.createLinearGradient(0, 0, MyConfig.CANVAS_COLOR_TEMP.WIDTH, 0);
                gradient.addColorStop(0, 'hsl(50, 100%, 80%)');
                gradient.addColorStop(0.45, '#FFFFFF');
                gradient.addColorStop(0.55, '#FFFFFF');
                gradient.addColorStop(1, 'hsl(190, 100%, 70%)');

                context.fillStyle = gradient;
                context.fillRect(0, 0, MyConfig.CANVAS_COLOR_TEMP.WIDTH, MyConfig.CANVAS_COLOR_TEMP.HEIGHT);

                if (ALLOW_CT_PRESETS && CT_PRESETS.length > 0) {
                    addColorTemperaturePresets(opt);
                }
            }
        } catch (e) {
            Utils.logError('Error in PhilipsHueLamp2.fillColorTempCanvas(): ' + e);
        }
    }

    function addColorTemperaturePresets(opt) {
        var inSceneAction = typeof opt !== 'undefined' && typeof opt['inSceneAction'] !== 'undefined' ? opt['inSceneAction'] : false;

        var presetHeight = 16;
        for (var i =0;i<CT_PRESETS.length;i++) {
            var preset = CT_PRESETS[i];
            var presetLabel = Utils.getLabel(preset['Label']);
            var delta = MyConfig.RANGES.ColorTemperature.left - MyConfig.RANGES.ColorTemperature.right;
            var px = Math.floor(100 - (preset['Value'] - MyConfig.RANGES.ColorTemperature.right) * 100 / delta);
            var mx = Math.floor(px * MyConfig.CANVAS_COLOR_TEMP.WIDTH / 100 - (presetHeight / 2));
            var my = Math.floor(MyConfig.CANVAS_COLOR_TEMP.HEIGHT / 2 - (presetHeight / 2));

            var html = '<div class="color_temperature_preset" title="'+presetLabel+'" data-preset_value="'+preset['Value']+'" data-preset_center_x="'+(mx + presetHeight / 2)+'" data-preset_center_y="'+(my + presetHeight / 2)+'"></div>';
            var $preset = $(html);
            $preset.css({
                left: mx + 'px',
                top: my + 'px',
                'z-index': 101
            });
            $preset.prependTo($('#' + MyConfig.CANVAS_HOLDER));
            $preset.off('click').on('click', function(e){
                e.stopPropagation();
                var retVal = {
                    colorTemperature: $(this).attr('data-preset_value'),
                    hue: -1,
                    saturation: -1
                };
                var presetX = $(this).attr('data-preset_center_x'), presetY = $(this).attr('data-preset_center_y');
                var xx = Utils.int(presetX) + Utils.int(getElementOffset(document.getElementById(MyConfig.CANVAS_COLOR_TEMP.ID)).left) + 1;

                if (inSceneAction) {
                    var posX = Math.floor(presetX - MyConfig.CANVAS_MARKER.WIDTH / 2) - 1;
                    var posY = Math.floor(MyConfig.CANVAS_MARKER.HEIGHT / 2);
                    $('#' + MyConfig.CANVAS_MARKER.ID).css({
                        'top': posY + 'px',
                        'left': posX + 'px'
                    }).show();
                    sceneActionPickedValues = retVal;
                    $('#save_scene_actions').removeAttr('disabled').removeClass('hidden');

                } else {
                    processClickedValue(retVal, xx, Utils.int(presetY));
                }
            });
        }
    }

    function fillHueSatCanvas() {
        try {
            var canvas = $('#' + MyConfig.CANVAS_HUE_SAT.ID).get()[0];
            if (typeof canvas != 'undefined' && canvas != null) {
                var context = canvas.getContext('2d');

                for (var i = 0; i < MyConfig.CANVAS_HUE_SAT.WIDTH; ++i) {
                    var ratio = i / MyConfig.CANVAS_HUE_SAT.WIDTH;
                    var hue = Math.floor(360 * ratio), saturation = 100, lightness = 50;

                    var gradient = context.createLinearGradient(0, MyConfig.CANVAS_HUE_SAT.TOP + MyConfig.CANVAS_HUE_SAT.LEFT, 0, MyConfig.CANVAS_HUE_SAT.HEIGHT);
                    gradient.addColorStop(0, '#FFFFFF');
                    gradient.addColorStop(1, 'hsl(' + hue + ',' + saturation + '%,' + lightness + '%)');
                    context.fillStyle = gradient;
                    context.fillRect(i, MyConfig.CANVAS_HUE_SAT.TOP, i + 1, MyConfig.CANVAS_HUE_SAT.HEIGHT);
                }
            }
        } catch (e) {
            Utils.logError('Error in PhilipsHueLamp2.fillHueSatCanvas(): ' + e);
        }
    }

    function showMarkerAtMousePosition(val, mx, my) {
        try {
            var canvas, x = 0, y = 0;
            if (val['colorTemperature'] > -1) {
                canvas = $('#' + MyConfig.CANVAS_COLOR_TEMP.ID).get()[0];
                if (typeof canvas != 'undefined' && canvas != null) {
                    x = Math.max(mx - getElementOffset(canvas).left - 1, 0) - Math.floor(MyConfig.CANVAS_MARKER.WIDTH / 2);
                    y = Math.floor(MyConfig.CANVAS_COLOR_TEMP.HEIGHT / 2) - Math.floor(MyConfig.CANVAS_MARKER.HEIGHT / 2);

                    $('#' + MyConfig.CANVAS_MARKER.ID).css({
                        'position': 'absolute',
                        'top': y,
                        'left': x
                    }).show();
                }
            }
            if (val['hue'] > -1 && val['saturation'] > -1) {
                canvas = $('#' + MyConfig.CANVAS_HUE_SAT.ID).get()[0];
                if (typeof canvas != 'undefined' && canvas != null) {
                    var pos = getMousePos(canvas, mx, my);
                    x = pos['x'] - Math.floor(MyConfig.CANVAS_MARKER.WIDTH / 2);
                    y = pos['y'] - Math.floor(MyConfig.CANVAS_MARKER.HEIGHT / 2) + MyConfig.CANVAS_COLOR_TEMP.HEIGHT;

                    $('#' + MyConfig.CANVAS_MARKER.ID).css({
                        'top': y,
                        'left': x
                    }).show();
                }
            }
        } catch (e) {
            Utils.logError('Error in PhilipsHueLamp2.showMarkerAtMousePosition(): ' + e);
        }
    }

    function drawCanvasForMarker() {
        var canvas = $('#' + MyConfig.CANVAS_MARKER.ID).get()[0];
        if (typeof canvas != 'undefined' && canvas != null) {
            var ctx = canvas.getContext('2d');

            var x = Math.floor(MyConfig.CANVAS_MARKER.WIDTH / 2 - 12);
            var y = Math.floor(MyConfig.CANVAS_MARKER.HEIGHT / 2 - 12);

            var img = new Image;
            img.onload = function () {
                ctx.drawImage(img, x, y);
            };
            img.src = 'skins/default/img/other/marker_philipshue_24.png';

            //ctx.beginPath();
            //ctx.moveTo(x, y + 10);
            //ctx.lineTo(x, y - 10);
            //ctx.moveTo(x - 10, y);
            //ctx.lineTo(x + 10, y);
            //ctx.stroke();
        }
    }

    function handleMouseOutOfCanvas() {
        var txtValForColorTemperature = '-', txtValForHue = '-', txtValForSaturation = '-';
        var found = false;

        if (pickedValues['colorTemperature'] > -1) {
            txtValForColorTemperature = pickedValues['colorTemperature'];
            found = true;
        }

        if (pickedValues['hue'] > -1 && pickedValues['saturation'] > -1) {
            txtValForHue = pickedValues['hue'];
            txtValForSaturation = pickedValues['saturation'];
            found = true;
        }

        if (found) {
            $('#' + MyConfig.CONTAINER_SELECTED_COLOR_TEMPERATURE).html(txtValForColorTemperature);
            $('#' + MyConfig.CONTAINER_SELECTED_HUE).html(txtValForHue);
            $('#' + MyConfig.CONTAINER_SELECTED_SATURATION).html(txtValForSaturation);
        } else {
            $('#' + MyConfig.CONTAINER_SELECTED_COLOR_TEMPERATURE).html('-');
            $('#' + MyConfig.CONTAINER_SELECTED_HUE).html('-');
            $('#' + MyConfig.CONTAINER_SELECTED_SATURATION).html('-');
            $('#' + MyConfig.CONTAINER_SET).hide();
        }
    }

    function getValuesAtMousePosition(mx, my) {
        var retVal = {
            colorTemperature: -1,
            hue: -1,
            saturation: -1
        };
        try {
            var elem = $('#' + MyConfig.CANVAS_HOLDER).get()[0];
            if (typeof elem != 'undefined' && elem != null) {
                var x = 0, y = 0;
                x = Math.max(mx - getElementOffset(elem).left - 1, 0);
                y = Math.max(my - getElementOffset(elem).top - 2, 0);

                if (y <= MyConfig.CANVAS_COLOR_TEMP.HEIGHT) {
                    var pickedValue = Math.round(100 - 100 * (x / (MyConfig.CANVAS_COLOR_TEMP.WIDTH - 1)));
                    var delta = MyConfig.RANGES.ColorTemperature.left - MyConfig.RANGES.ColorTemperature.right;

                    retVal['colorTemperature'] = Math.floor(pickedValue / 100 * delta) + MyConfig.RANGES.ColorTemperature.right;
                } else {
                    y = y - MyConfig.CANVAS_HUE_SAT.TOP;
                    var pickedHue = Math.round(100 * (x / (MyConfig.CANVAS_HUE_SAT.WIDTH - 1)));
                    var pickedSaturation = Math.round(y * 100 / MyConfig.CANVAS_HUE_SAT.HEIGHT);
                    var deltaSaturation = MyConfig.RANGES.Saturation.max - MyConfig.RANGES.Saturation.min;

                    retVal['hue'] = Math.floor(pickedHue / 100 * 65535);
                    retVal['saturation'] = Math.floor(pickedSaturation / 100 * deltaSaturation) + MyConfig.RANGES.Saturation.min;
                }
            }
        } catch (e) {
            Utils.logError('Error in PhilipsHueLamp2.getValuesAtMousePosition(): ' + e);
        }

        return retVal;
    }

    function getElementOffset(element) {
        var _x = 0, _y = 0;
        try {
            var rect = element.getBoundingClientRect();
            _x = rect.left;
            _y = rect.top;
        } catch (e) {
            Utils.logError('Error in PhilipsHueLamp2.getElementOffset(): ' + e);
        }

        return {top: _y, left: _x};
    }

    function readCurrentVariableState() {
        try {
            var txt = "";
            if (editedSceneObj) {
                txt = api.getDeviceState(selectedHueDeviceLights[0], SID, VARIABLE_LAMP_VALUES);
            } else {
                txt = api.getDeviceState(api.getCpanelDeviceId(), SID, VARIABLE_LAMP_VALUES);
            }

            if (typeof txt !== 'undefined' && txt !== false) {
                var splits = txt.split(/[,;]+/), splits2;
                if (splits.length == 1) {
                    splits2 = splits[0].split(':');
                    if (typeof splits2[1] != 'undefined') {
                        if (splits2[0].toLowerCase() == 'ct') {
                            pickedValues['colorTemperature'] = parseInt(splits2[1], 10);
                        }
                    }
                } else if (splits.length == 2) {
                    splits2 = splits[0].split(':');
                    if (splits2[0].toLowerCase() == 'hue') {
                        pickedValues['hue'] = parseInt(splits2[1], 10);
                    }
                    if (splits2[0].toLowerCase() == 'sat') {
                        pickedValues['saturation'] = parseInt(splits2[1], 10);
                    }

                    splits2 = splits[1].split(':');
                    if (splits2[0].toLowerCase() == 'hue') {
                        pickedValues['hue'] = parseInt(splits2[1], 10);
                    }
                    if (splits2[0].toLowerCase() == 'sat') {
                        pickedValues['saturation'] = parseInt(splits2[1], 10);
                    }
                }
            }

            var mx = 0, my = 0, canvas;

            if (pickedValues['colorTemperature'] > -1) {
                // find the coordinates...

                canvas = $('#' + MyConfig.CANVAS_COLOR_TEMP.ID).get()[0];
                if (typeof canvas != 'undefined' && canvas != null) {
                    var delta = MyConfig.RANGES.ColorTemperature.left - MyConfig.RANGES.ColorTemperature.right;
                    var px = Math.floor(100 - (pickedValues['colorTemperature'] - MyConfig.RANGES.ColorTemperature.right) * 100 / delta);
                    mx = getElementOffset(canvas).left + Math.floor(px * MyConfig.CANVAS_COLOR_TEMP.WIDTH / 100);
                    my = getElementOffset(canvas).top + Math.floor(MyConfig.CANVAS_COLOR_TEMP.HEIGHT / 2);

                    showMarkerAtMousePosition(pickedValues, mx, my);
                    updateValues(pickedValues);
                }
            } else if (pickedValues['hue'] > -1 && pickedValues['saturation'] > -1) {
                // find the coordinates...
                canvas = $('#' + MyConfig.CANVAS_HUE_SAT.ID).get()[0];
                if (typeof canvas != 'undefined' && canvas != null) {
                    var deltaSaturation = MyConfig.RANGES.Saturation.max - MyConfig.RANGES.Saturation.min;
                    var py = Math.floor((pickedValues['saturation'] - MyConfig.RANGES.Saturation.min) * 100 / deltaSaturation);

                    mx = getElementOffset(canvas).left + Math.floor(pickedValues['hue'] * MyConfig.CANVAS_HUE_SAT.WIDTH / MyConfig.RANGES.Hue.max);
                    my = getElementOffset(canvas).top + Math.floor(MyConfig.CANVAS_HUE_SAT.HEIGHT * py / 100);

                    showMarkerAtMousePosition(pickedValues, mx, my);
                    updateValues(pickedValues);
                }
            }

            // preselect the effect...
            txt = api.getDeviceState(api.getCpanelDeviceId(), SID, VARIABLE_LAMP_EFFECT_VALUE);
            if (typeof txt !== 'undefined' && txt != false) {
                $('#philips_hue_lamp_2_effect').val(txt);
            }

            // preselect the transition time...
            txt = api.getDeviceState(api.getCpanelDeviceId(), SID, VARIABLE_DEFAULT_TRANSITION_TIME);
            if (typeof txt !== 'undefined' && txt != false) {
                var enteredDefaultTransitionTimeValue = Utils.int(txt);
                if (isNaN(enteredDefaultTransitionTimeValue) || enteredDefaultTransitionTimeValue < TRANSITION_TIME_MIN || enteredDefaultTransitionTimeValue > TRANSITION_TIME_MAX) {
                    enteredDefaultTransitionTimeValue = getTransitionTimeValue();
                }

                $('#philips_hue_lamp_2_transition_time').val(enteredDefaultTransitionTimeValue);
            }
        } catch (e) {
            Utils.logError('Error in PhilipsHueLamp2.readCurrentVariableState(): ' + e);
        }
    }

    function handleSetColorPresetSuccess() {
        try {
            var labelSuccess = Utils.getLabel(MyConfig.LABEL_SUCCESS);
            $('#' + MyConfig.CONTAINER_FEEDBACK).html(labelSuccess).show();
            setTimeout(function () {
                $('#' + MyConfig.CONTAINER_FEEDBACK).hide();
            }, 2000);
        } catch (e) {
            Utils.logError('Error in PhilipsHueLamp2.handleSetColorPresetSuccess(): ' + e);
        }
    }

    function handleSetColorPresetFailure() {
        try {
            var labelError = Utils.getLabel(MyConfig.LABEL_ERROR);
            $('#' + MyConfig.CONTAINER_FEEDBACK).html(labelError).show();
            setTimeout(function () {
                $('#' + MyConfig.CONTAINER_FEEDBACK).hide();
            }, 2000);
        } catch (e) {
            Utils.logError('Error in PhilipsHueLamp2.handleSetColorPresetFailure(): ' + e);
        }
    }

    function color_picker() {
        try {
            // initialize values...
            pickedValues = {
                colorTemperature: -1,
                hue: -1,
                saturation: -1
            };
            init();
            colorPickerCalledFrom = arguments[0];
            // get the view...
            api.setCpanelContent(returnHTMLContainer());			
            // fill the canvas...
            fillCanvases();

            // attach event handlers...
            attachCanvasEventHandlers();

            // handler for 'set lamp values'...
            $('#' + MyConfig.BUTTON_SET_VALUES).off('click').on('click', function (e) {
                e.stopPropagation();
                sendPickedValues();
            });

            // handler for onchange on 'select color preset'...
            $('#' + MyConfig.SELECT_COLOR_PRESET).on('change', function () {
                var val = $(this).val();

                if (val > 0) {
                    $('#' + MyConfig.BUTTON_SET_PRESET_COLOR).show();
                } else {
                    $('#' + MyConfig.BUTTON_SET_PRESET_COLOR).hide();
                }
            });

            // handler for 'set preset' button...
            $('#' + MyConfig.BUTTON_SET_PRESET_COLOR).off('click').on('click', function (e) {
                e.stopPropagation();
                setColorPreset($('#' + MyConfig.SELECT_COLOR_PRESET).val());
            });

            // handler for 'effect' change...
            $('#philips_hue_lamp_2_effect').on('change', function(){
                handleLampEffectChange();
            });

            // handler for 'transition time' change...
            $('#philips_hue_lamp_2_transition_time').on('change', function(){
                handleLampTransitionTimeChange();
            });

            // draw canvas for marker...
            drawCanvasForMarker();

            // preselect current color...
            readCurrentVariableState();

            setLigthnessLevel();

            //if(editedSceneObj){
            //    // preselect current color...
            //    readCurrentVariableState();
            //    setLigthnessLevel();
            //}
        } catch (e) {
            Utils.logError('Error in PhilipsHueLamp2.color_picker(): ' + e);
        }
    }

    function handleLampEffectChange() {
        sendPickedValues();
    }

    function handleLampTransitionTimeChange() {		
		var enteredTransitionTime = $('#philips_hue_lamp_2_transition_time').val();
		if (enteredTransitionTime.length < 1 || isNaN(parseInt(enteredTransitionTime, 10)) || parseInt(enteredTransitionTime, 10) < 1 || parseInt(enteredTransitionTime, 10) > 100) {			
			var msg = Utils.getLabel(MyConfig.LABEL_TRANSITION_TIME_INVALID_VALUE_ENTERED).replace('__DEFAULT_TRANSITION_TIME_VALUE__', DEFAULT_TRANSITION_TIME);
			api.showCustomPopup(msg, {
               autoHide: 7,
               category: 'error'
			});
		$('#philips_hue_lamp_2_transition_time').val(DEFAULT_TRANSITION_TIME);
          return false;
        }
     sendPickedValues();	
    }

//=============================== scene list ==================================
    function sceneList() {
        try {
            init();
            deviceParentId = deviceObj.id_parent;
            bridgeSceneList = getHueSceneList(deviceParentId);
            lightList = getBridgeHueLightsList(deviceParentId);
            lightDeviceIdList = application.getDeviceChildenIdList(deviceParentId);
            var sceneListView = returnSceneListView(bridgeSceneList);
            api.setCpanelContent(sceneListView);
            addBehaviorToSceneButtons();
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.sceneList(): ' + err);
        }
    };
    function getHueSceneList(deviceParentId) {
        try {
            var sceneString = api.getDeviceState(deviceParentId, "urn:micasaverde-com:serviceId:PhilipsHue1", "BridgeScenes");
            var scenesObj = JSON.parse(sceneString);
            for (var scene in scenesObj) {
                bridgeSceneList.push({id: scene, name: scenesObj[scene].name, lights: scenesObj[scene].lights});
            }
            return bridgeSceneList;
        } catch (err) {

        }
    }
    ;
    function returnSceneListView(bridgeSceneList) {
        try {
            var html = '<div class="philipsSceneListContainer">' +
                '   <div class="clearfix">' +
                '       <div class="pull-left flip clearfix devicesFavoritesContainer">' +
                '           <div class="pull-left flip select_favorites_title">' +
                '               <span>' + Utils.getLangString("ui7_click", "Click") + '</span>' +
                '               <span class="icon-unpinned_device"></span>' +
                '               <span>' + Utils.getLangString("ui7_toSelectFavorites", "to select favorites") + '</span>' +
                '           </div>' +
                '       </div>' +
                '       <div id="createHueSceneBtn" class="pull-right flip">' +
                '           <div class="devices_add_device_control_container">' +
                '               <div class="add_device_label">' + Utils.getLangString("ui7_createNewScene", "Create New Scene") + '</div>' +
                '           </div>' +
                '       </div>' +
                '   </div>' +
                '<div class="hueSceneListTableContainer"><table class="table">' +
                '<thead>' +
                '   <tr>' +
                '       <th class="hueSceneList-scenes col-md-8 col-sm-8 col-xs-8">' + Utils.getLangString("ui7_general_ucase_programs", "Scenes") + '</th>' +
                '       <th class="hueSceneList-delete col-md-2 col-sm-2 col-xs-2">' + Utils.getLangString("ui7_general_ucase_delete", "Delete") + '</th>' +
                '       <th class="hueSceneList-favorites col-md-2 col-sm-2 col-xs-2">' + Utils.getLangString("ui7_general_ucase_favorites", "Favorites") + '</th>' +
                '   </tr>' +
                '</thead>' +
                '<tbody id="hueBridgeSceneList">';

            if (typeof bridgeSceneList != 'undefined' && bridgeSceneList.length > 0) {
                for (var i = 0; i < bridgeSceneList.length; i++) {
                    html += returnSceneRowContent(bridgeSceneList[i]);
                }
            }

            html += '</tbody>' +
            '</table></div>' +
            '</div>';
            return html;
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.returnSceneListView(): ' + err);
        }
    };
    function returnSceneRowContent(sceneObj) {
        try {
            var favorite = "";
            var bridgeFavoriteSceneList = [];
            var bridgeFavoriteScenesValue = api.getDeviceState(deviceParentId, "urn:micasaverde-com:serviceId:PhilipsHue1", "BridgeFavoriteScenes");
            if (bridgeFavoriteScenesValue) {
                bridgeFavoriteSceneList = bridgeFavoriteScenesValue.split(",");
            }
            if (Utils.inArray(sceneObj.id, bridgeFavoriteSceneList)) {
                favorite = "favorite";
            }
            sceneName = sceneObj.name.split(' ');
            var html = '<tr id="">' +
                '   <td class="alignVerticalMiddle">' +
                '       <span data-edit-scene-id="' + sceneObj.id + '" title="' + Utils.getLangString("ui7_scene_edit_program", "Edit Scene") + '" class="blockSpan icon-scene_edit_button pull-left"></span>' +
                '       <span class="pull-left flip hue-scene-name">' + sceneName[0] + '</span>' +
                '   </td>' +
                '   <td class="alignVerticalMiddle hueSceneList-delete">' +
                '       <span data-delete-scene-id="' + sceneObj.id + '" title="' + Utils.getLangString("ui7_deleteScene", "Delete Scene") + '" class="blockSpan icon-create_scene_trigger_button_remove"></span>' +
                '   </td>' +
                '   <td class="alignVerticalMiddle">' +
                '       <span data-favorite-scene-id="' + sceneObj.id + '" title="' + Utils.getLangString("ui7_favoriteScene", "Favorite Scene") + '" class="blockSpan device_unpinned ' + favorite + '"></span>' +
                '   </td>' +
                '</tr>';
            return html;
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.returnSceneRowContent(): ' + err);
        }
    };
    function addBehaviorToSceneButtons() {
        try {
            $("#hueBridgeSceneList").find("[data-edit-scene-id]").each(function () {
                $(this).off().on('click', function () {
                    var sceneId = $(this).data("edit-scene-id");
                    editHueScene(sceneId);
                });
            });
            $("#hueBridgeSceneList").find("[data-delete-scene-id]").each(function () {
                $(this).off().on('click', function () {
                    var sceneId = $(this).data("delete-scene-id");
                    deleteHueScene(sceneId);
                });
            });
            $("#hueBridgeSceneList").find("[data-favorite-scene-id]").each(function () {
                $(this).off().on('click', function () {
                    var sceneId = $(this).data("favorite-scene-id");
                    favoriteHueScene(sceneId);
                });
            });
            $("#createHueSceneBtn").off().on("click", function () {
                createHueScene();
            });
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.addBehaviorToSceneButtons(): ' + err);
        }
    };
    function editHueScene(sceneId) {
        try {
            console.log("editHueScene");
            console.log("scene id:", sceneId);
            var sceneObjEdit = getHueSceneById(sceneId);
            editedSceneObj = sceneObjEdit;
            createHueScene("calledFromEdit");
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.editHueScene(): ' + err);
        }
    }
    ;
    function getHueSceneById(sceneId) {
        try {
            console.log("getHueSceneById");
            console.log("sceneId", sceneId);
            for (var i = 0; i < bridgeSceneList.length; i++) {
                if (String(bridgeSceneList[i].id) === String(sceneId)) {
                    return bridgeSceneList[i];
                }
            }
        } catch (err) {

        }
    }
    ;
    function deleteHueScene(sceneId) {
        try {
            console.log("deleteHueScene");
            console.log("scene id:", sceneId);
            myInterface.showConfirmPopup(Utils.getLangString("ui7_scene_confirm_delete", "Are you sure you want to delete this scene ?"), function () {
                console.log("init deleting hue scene");
            });
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.deleteHueScene(): ' + err);
        }
    };
    function favoriteHueScene(sceneId) {
        try {
            console.log("favoriteHueScene");
            console.log("scene id:", sceneId);
            var bridgeFavoriteSceneList = [];
            var bridgeFavoriteScenesValue = api.getDeviceState(deviceParentId, "urn:micasaverde-com:serviceId:PhilipsHue1", "BridgeFavoriteScenes");
            if (bridgeFavoriteScenesValue) {
                bridgeFavoriteSceneList = bridgeFavoriteScenesValue.split(",");
            } else {
                api.setDeviceStatePersistent(deviceParentId, "urn:micasaverde-com:serviceId:PhilipsHue1", "BridgeFavoriteScenes", sceneId, {
                        onSuccess: function () {
                            $('[data-favorite-scene-id="' + sceneId + '"]').addClass('favorite');
                        }
                    }
                );
            }
            console.log("bridgeFavoriteSceneList", bridgeFavoriteSceneList);
            if (Utils.inArray(sceneId, bridgeFavoriteSceneList)) {
                removeElemFromArray(sceneId, bridgeFavoriteSceneList);
                var hueSceneFavoriteString = bridgeFavoriteSceneList.join(",");
                api.setDeviceStatePersistent(deviceParentId, "urn:micasaverde-com:serviceId:PhilipsHue1", "BridgeFavoriteScenes", hueSceneFavoriteString, {
                    onSuccess: function () {
                        $('[data-favorite-scene-id="' + sceneId + '"]').removeClass('favorite');
                    }
                });
            } else {
                bridgeFavoriteSceneList.push(sceneId);
                var hueSceneFavoriteString = bridgeFavoriteSceneList.join(",");
                api.setDeviceStatePersistent(deviceParentId, "urn:micasaverde-com:serviceId:PhilipsHue1", "BridgeFavoriteScenes", hueSceneFavoriteString, {
                    onSuccess: function () {
                        $('[data-favorite-scene-id="' + sceneId + '"]').addClass('favorite');
                    }
                });
            }
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.favoriteHueScene(): ' + err);
        }
    };
    function createHueScene() {
        try {
            console.log("createHueScene");
            if (typeof arguments[0] === "undefined") {
                editedSceneObj = null;
            }
            var createSceneView = returnCreateHueScene(lightList, lightDeviceIdList);
            api.setCpanelContent(createSceneView);
            addBehaviorToCreateHueSceneBtn();
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.createHueScene(): ' + err);
        }
    };
    function getBridgeHueLightsList(deviceParentId) {
        try {
            var lightsString = api.getDeviceState(deviceParentId, SID, "BridgeLights");
            var lights = lightsString.split(";");
            var lightList = [];
            for (var i = 0; i < lights.length; i++) {
                var innerLights = lights[i].split(",");
                lightList.push({id: innerLights[0], name: innerLights[1]});
            }
            return lightList;
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.getBridgeHueLightsList(): ' + err);
        }
    };
    function returnCreateHueScene(lightList) {
        try {
            var html = '<div class="createHueSceneContainer">' +
                '<div class="hueLightsContainer" id="hueLightsContainer">' + returnHueLights(lightList, lightDeviceIdList) + '</div>' +
                '<div class="hueAddToRoomContainer">' + returnHueAddToRoom() + '</div>' +
                '<div class="hueNameSceneContainer">' + returnHueNameScene() + '</div>' +
                '<div class="clearfix">' +
                '<div id="saveHueScene" class="setup_wizard_button pull-right flip saveBtn">' + Utils.getLangString("ui7_general_ucase_save", "Save") + '</div>' +
                '</div>' +
                '</div>';
            return html;
        } catch (err) {

        }
    };

    function returnHueLights(lightList, lightDeviceIdList) {
        try {
            selectedHueLights = [];
            selectedHueDeviceLights = [];
            var html = '<div class="clearfix">' +
                '   <div class="scenes_button_cancel" id="deselectHueLights">' + Utils.getLangString("ui7_deselectAll", "Deselect All") + '</div>' +
                '</div>' +
                '<div class="legendHeader"><h3>' + Utils.getLangString("ui7_lights", "Lights") + '</h3></div>';

            if (lightList.length > 0) {
                for (var i = 0; i < lightList.length; i++) {
                    html += returnHueLightRow(lightList[i], lightDeviceIdList[i], i);
                }
            }
            return html;
        } catch (err) {

        }
    };
    function returnHueAddToRoom() {
        try {
            var html = '<div class="legendHeader"><h3>' + Utils.getLangString("ui7_addToMyRoom", "Add to My Room") + '</h3></div>' +
                '   <div class="clearfix">' +
                '       <div class="pull-left flip">' + Utils.getLangString("ui7_roomName", "Room Name:") + '</div>' +
                '       <div class="pull-left flip createHueSceneSelectContainer customSelectBoxContainer">' + View.returnSelectFromObject(myInterface.returnRoomsObject(false), View.idForDeviceCpanelRoomContainer(true), 'class="createHueSceneSelect customSelectBox"') + ' </div>' +
                '       <div id="' + View.idForDeviceCpanelAddRoom(true) + '"></div>' +
                '       <div class="device_cpanel_label" id="' + View.idForDeviceCpanelRoomDeviceMsg(true) + '"></div>' +
                '   </div>';
            return html;
        } catch (err) {

        }
    };
    function returnHueNameScene() {
        return '';
        try {
            var hueSceneName = "", sceneName = '';
            if (editedSceneObj) {
                hueSceneName = editedSceneObj.name;
                sceneName = hueSceneName.split(' ');
                sceneName = getDisplayedSceneName(editedSceneObj.name);
            }
            var html = '<div class="legendHeader"><h3>' + Utils.getLangString("ui7_nameYourScene", "Name Your Scene") + '</h3></div>' +
                '   <div class="pluginInputLabel">' +
                '       <span">' + Utils.getLangString("ui7_general_ucase_name", "Name") + ':</span>' +
                '       <input class="device_cpanel_input_text" type="text" id="newHueSceneName" value="' + sceneName[0] + '"/>' +
                '   </div>';
            return html;
        } catch (err) {
            Utils.logError('Error in returnHueNameScene(): ' + err);
        }
    }

    function getDisplayedSceneName(sceneName) {
        var displaytedSceneName = sceneName;
        try {
            displaytedSceneName = sceneName.replace(/\ on\ [0-9]+$/, "");
            displaytedSceneName = displaytedSceneName.replace(/\ off\ [0-9]+$/, "");
        } catch (e) {
            Utils.logError('Error in getDisplayedSceneName(): ' + e);
        }
        return displaytedSceneName;
    }

    function returnHueLightRow(lightObj, lightDeviceId, index) {
        try {
            var slectedLight = 0;
            var checkedLight = ""
            if (editedSceneObj) {
                if (Utils.inArray(lightObj.id, editedSceneObj.lights)) {
                    slectedLight = 1;
                    checkedLight = "checked";
                    selectedHueLights.push(lightObj.id);
                    selectedHueDeviceLights.push(lightDeviceId);
                }
            }
            var html = '<div class="clearfix hueLightRow">' +
                '   <div class="pull-left flip wifi_network_item_name">' + lightObj.id + '. ' + lightObj.name + '</div>' +
                '   <div data-light-device-userdata-id="' + lightDeviceId + '" data-checked="' + slectedLight + '" data-hue-light-select-id="' + lightObj.id + '" class="pull-right flip create_scene_select_mode_row_check ' + checkedLight + '"></div>' +
                '</div>';
            return html;
        } catch (e) {
            Utils.logError('Error in View.returnWirelessNetworkItemView(): ' + e);
        }
    };
    function addBehaviorToCreateHueSceneBtn() {
        try {
            $("#hueLightsContainer").find("[data-hue-light-select-id]").each(function () {
                $(this).off().on('click', function () {
                    var lightId = $(this).data("hue-light-select-id");
                    var lightDeviceId = $(this).data("light-device-userdata-id");
                    var lightChecked = $(this).data("checked");
                    addLightToHueScene(lightId, lightChecked, lightDeviceId);
                });
                $("#saveHueScene").off().on('click', function () {
                    saveHueScene();
                });
            });
        } catch (err) {

        }
    };
    function addLightToHueScene(lightId, lightChecked, lightDeviceId) {
        try {
            if (Utils.int(lightChecked) === 0) {
                $('[data-hue-light-select-id="' + lightId + '"]').addClass('checked');
                $('[data-hue-light-select-id="' + lightId + '"]').data('checked', "1");
                if (!Utils.inArray(String(lightId), selectedHueLights)) {
                    selectedHueLights.push(String(lightId));
                }
                if (!Utils.inArray(String(lightDeviceId), selectedHueDeviceLights)) {
                    selectedHueDeviceLights.push(String(lightDeviceId));
                }
            } else {
                $('[data-hue-light-select-id="' + lightId + '"]').removeClass('checked');
                $('[data-hue-light-select-id="' + lightId + '"]').data('checked', "0");
                removeElemFromArray(String(lightId), selectedHueLights);
                removeElemFromArray(String(lightDeviceId), selectedHueDeviceLights);
            }
            console.log("selectedHueLights", selectedHueLights);
            console.log("selectedHueDeviceLights", selectedHueDeviceLights);
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.addLightToHueScene(): ' + err);
        }

    };
    function saveHueScene() {
        try {
            hueSceneObj = getHueSceneFromDOM();
            if (!hueSceneObj.name) {
                myInterface.showMessagePopup(Utils.getLangString("ui7_hueSceneEmpty", "You must choose a name for your scene"), MessageCategory.NOTIFICATION);
                return;
            }
            ;
            if (!/^[a-zA-Z0-9]+$/.test(Utils.trim(hueSceneObj.name))) {
                myInterface.showMessagePopup(Utils.getLangString("ui7_invlidHueSceneName", "Scene name should contain only numbers and letters."), MessageCategory.NOTIFICATION);
                return false;
            }
            if (selectedHueLights.length === 0) {
                myInterface.showMessagePopup(Utils.getLangString("ui7_noHueLightSelected", "You must select at least one light"), MessageCategory.NOTIFICATION);
                return;
            }
            if (editedSceneObj) {
                hueSceneObj.id = editedSceneObj.id;
            }
            bridgeLightIdToUserDataLightId = mapBridgeLightIdToUserDataId();
            addColorPicker();
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.saveHueScene(): ' + err);
        }
    };
    function addColorPicker() {
        try {
            console.log("addColorPicker");
            color_picker("sceneList");
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.addColorPicker(): ' + err);
        }
    };
    function getHueSceneFromDOM() {
        try {
            var hueSceneObj = {};
            hueSceneObj.name = $("#newHueSceneName").val();
            hueSceneObj.lights = selectedHueLights.join();
            hueSceneObj.room = $("#device_cpanel_room_device_select").val();
            hueSceneObj.id = Date.now();
            return hueSceneObj;
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.getHueSceneFromDOM(): ' + err);
        }
    };
    function mapBridgeLightIdToUserDataId() {
        try {
            var bridgeLightMap = {};
            for (var i = 0; i < selectedHueLights.length; i++) {
                bridgeLightMap[selectedHueLights[i]] = selectedHueDeviceLights[i];
            }
            return bridgeLightMap;
        } catch (err) {

        }
    };
    function removeElemFromArray(elemId, array) {
        try {
            var index = array.indexOf(elemId);
            if (index > -1) {
                array.splice(index, 1);
            }
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.removeElemFromArray(): ' + err);
        }
    };
    function saveHueSceneAndHueLightsColors() {
        try {
            myInterface.showModalLoading();
            if (editedSceneObj) {
                modifyHueScene();
                editedSceneObj = null;
            } else {
                sendCreateHueSceneCommand();
            }
        } catch (err) {

        }
    };
    function saveHueLightsColors() {
        try {
            var lightsIdList = hueSceneObj.lights.split(",");

            for (var i = 0; i < lightsIdList.length; i++) {
                (function (i) {
                    setTimeout(function () {
                        sendPickedValues(bridgeLightIdToUserDataLightId[lightsIdList[i]]);
                    }, 1000 * i);
                })(i);
            }
        } catch (err) {

        }
    };
    function sendCreateHueSceneCommand() {
        try {
            api.performLuActionOnDevice(deviceParentId, "urn:micasaverde-com:serviceId:PhilipsHue1", "CreateHueScene", {
                actionArguments: {
                    Scene: hueSceneObj.id,
                    Name: hueSceneObj.name,
                    Lights: hueSceneObj.lights
                },
                onSuccess: function () {
                    myInterface.hideModalLoading();
                },
                onError: function () {
                    myInterface.hideModalLoading();
                }
            });
        } catch (err) {

        }
    }
    ;
    function modifyHueScene() {
        try {
            var lightsIdList = hueSceneObj.lights.split(",");

            for (var i = 0; i < lightsIdList.length; i++) {
                (function (i) {
                    setTimeout(function () {
                        sendModifyHueSceneCommand(lightsIdList[i]);
                    }, 1000 * i);
                })(i);
            }
        } catch (err) {

        }
    }
    ;
    function sendModifyHueSceneCommand(lightId) {
        try {
            console.log("sendCreateHueSceneCommand");
            var lightOption = {};
            lightOption.bri = $("#luminositySlider").slider("value");
            if (Utils.int(pickedValues.colorTemperature) > -1) {
                lightOption.ct = pickedValues.colorTemperature;
            } else {
                lightOption.hue = pickedValues.hue;
                lightOption.sat = pickedValues.saturation;
            }
            api.performLuActionOnDevice(deviceParentId, "urn:micasaverde-com:serviceId:PhilipsHue1", "ModifyHueScene", {
                actionArguments: {
                    Scene: hueSceneObj.id,
                    Light: lightId,
                    Data: JSON.stringify(lightOption)
                },
                onSuccess: function () {
                    myInterface.hideModalLoading();
                },
                onError: function () {
                    myInterface.hideModalLoading();
                }
            });
        } catch (err) {

        }
    }
    ;
    function saveHueLightness(sliderValue) {
        try {
            var lightsIdList = typeof hueSceneObj.lights != 'undefined' ? hueSceneObj.lights.split(",") : [];

            for (var i = 0; i < lightsIdList.length; i++) {
                (function (i) {
                    setTimeout(function () {
                        sendHueLightnessCommand(bridgeLightIdToUserDataLightId[lightsIdList[i]], sliderValue);
                    }, 1000 * i);
                })(i);
            }
        } catch (err) {
            Utils.logError('Error in saveHueLightness(): ' + err);
        }
    }

    function handlerForSliderLightnessStop(value) {
        try {
            sendHueLightnessCommand(deviceId, value);
        } catch (err) {
            Utils.logError('Error in handlerForSliderLightnessStop(): ' + err);
        }
    }

    function sendHueLightnessCommand(deviceId, lightnessLevel) {
        try {
            api.performLuActionOnDevice(deviceId, "urn:upnp-org:serviceId:Dimming1", "SetLoadLevelTarget", {
                actionArguments: {
                    newLoadlevelTarget: lightnessLevel
                },
                onSuccess: function () {
                    myInterface.hideModalLoading();
                },
                onError: function () {
                    myInterface.hideModalLoading();
                }
            });

        } catch (err) {
            Utils.logError('Error in PhilipsHueLamp2.sendHueLightnessCommand(): ' + err);
        }
    };
    function convertPhilpsHueToRegularHue(hue) {
        try {
            var regualrHue = Math.ceil(hue / 182.5487);
            return regualrHue;
        } catch (err) {

        }
    };
    function convertPhilpsSaturationToRegularSaturation(saturation) {
        try {
            var regualrSaturation = Math.ceil((saturation * 100) / 254);
            return regualrSaturation;
        } catch (err) {

        }
    };
    function saveHueLightsColoTemp() {
        try {
            var lightsIdList = hueSceneObj.lights.split(",");

            for (var i = 0; i < lightsIdList.length; i++) {
                (function (i) {
                    setTimeout(function () {
                        sendHueLightsColoTemp(bridgeLightIdToUserDataLightId[lightsIdList[i]]);
                    }, 1000 * i);
                })(i);
            }
        } catch (err) {

        }
    };
    function sendHueLightsColoTemp(lightId) {
        try {
            api.performLuActionOnDevice(lightId, SID, ACTION_SET_COLOR_TEMP, {
                actionArguments: {
                    ColorTemperature: pickedValues['colorTemperature']
                }
            });
        } catch (err) {

        }
    };
    function setLuminositySliderColor(retVal) {
        try {
            var hue = convertPhilpsHueToRegularHue(retVal.hue);
            var saturation = convertPhilpsSaturationToRegularSaturation(retVal.saturation);
            var lightness = 50;
            var colorString = "hsl(" + hue + "," + saturation + "," + lightness + ")";
            var color = tinycolor(colorString);
            var rgbString = color.toRgbString();
            $("#luminositySlider .ui-slider-range").css({"background-color": rgbString});
        } catch (err) {

        }
    }
    function setLigthnessLevel() {
        try {
            var ligthnessLevel = api.getDeviceState(deviceId, "urn:upnp-org:serviceId:Dimming1", "LoadLevelTarget");
            if (ligthnessLevel) {
                $("#luminositySlider").slider("value", ligthnessLevel);
                var intensityValue = ligthnessLevel + ' %';
                $("#luminosityIntensity").html(intensityValue);
            }
        } catch (err) {
            Utils.logError('Error in PhilipsHueLamp.setLigthnessLevel(): ' + err);
        }
    }

    function returnHTMLContainerForSceneAction() {
        var labelButtonSetValues = Utils.getLabel(MyConfig.LABEL_BUTTON_SET_LAMP);
        var labelSetPresetColor = Utils.getLabel(MyConfig.LABEL_SET_PRESET_COLOR);
        var labelColorTemperature = Utils.getLabel(MyConfig.LABEL_COLOR_TEMPERATURE);
        var labelHue = Utils.getLabel(MyConfig.LABEL_HUE);
        var labelSaturation = Utils.getLabel(MyConfig.LABEL_SATURATION);
        var labelOr = Utils.getLabel(MyConfig.LABEL_OR);
        var labelSetAColorPreset = Utils.getLabel(MyConfig.LABEL_SET_A_COLOR_PRESET);
        var sceneDeviceName = "";
        var transitionTimeUpdated = DEFAULT_TRANSITION_TIME;
        var labelSaveSceneAction = Utils.getLangString("ui7_general_save_scene_action", "Save");

        var html = '<div class="hueBridgeColorPickerContainer">' +
            '<div class="philips_hue_2_lightness_container clearfix">' +
            '   <div class="pull-left philips_hue_2_lightness_label" style="font-weight: bold;">' + Utils.getLabel(MyConfig.LABEL_EFFECT) + ':</div>' +
            '   <div class="pull-left margin_left_5 margin_top_5 customSelectBoxContainer">' +
            '       <select id="philips_hue_lamp_2_effect" class="customSelectBox">' +
            '           <option value="none">'+Utils.getLabel(MyConfig.LABEL_EFFECT_NONE)+'</option>' +
            '           <option value="colorloop">'+Utils.getLabel(MyConfig.LABEL_EFFECT_COLOR_LOOP)+'</option>' +
            '       </select>' +
            '   </div>' +
            '   <div class="pull-left philips_hue_2_lightness_label" style="margin-left: 30px; font-weight: bold;">' + Utils.getLabel(MyConfig.LABEL_TRANSITION_TIME) + ':</div>' +
            '   <div class="pull-left">' +
            '       <input class="device_cpanel_input_text margin_top_5" style="width: 60px; text-align: right;" type="text" id="philips_hue_lamp_2_transition_time" value="'+transitionTimeUpdated+'" />' +
            '   </div>' +
            '   <div class="clearfix"></div>'+
            '</div>' +
            '<div style="clear: both; position: relative;">' +
            '<div id="' + MyConfig.CANVAS_HOLDER + '" style="clear: both; z-index: 100; position: relative;">' +
            '   <canvas id="' + MyConfig.CANVAS_COLOR_TEMP.ID + '" width="' + MyConfig.CANVAS_COLOR_TEMP.WIDTH + '" height="' + MyConfig.CANVAS_COLOR_TEMP.HEIGHT + '" style="cursor: crosshair; border-top-left-radius: 5px; border-top-right-radius: 5px;"></canvas>' +
            '   <canvas id="' + MyConfig.CANVAS_HUE_SAT.ID + '" width="' + MyConfig.CANVAS_HUE_SAT.WIDTH + '" height="' + MyConfig.CANVAS_HUE_SAT.HEIGHT + '" style="cursor: crosshair; border-bottom-left-radius: 5px; border-bottom-right-radius: 5px;"></canvas>' +
            '</div>' +
            '<div id="' + MyConfig.CONTAINER_SELECTED_VALUES + '" style="clear: both; height: 25px; line-height: 25px; display: none;">' +
            '       <div style="float: left;">' +
            '           ' + labelColorTemperature + ': <span id="' + MyConfig.CONTAINER_SELECTED_COLOR_TEMPERATURE + '" style="width: 25px; height: 25px; color: #111111;">-</span>' +
            '       </div>' +
            '       <div style="float: left; margin-left: 10px;">' +
            '           ' + labelHue + ': <span id="' + MyConfig.CONTAINER_SELECTED_HUE + '" style="width: 25px; height: 25px; color: #111111;">-</span>' +
            '       </div>' +
            '       <div style="float: left; margin-left: 10px;">' +
            '           ' + labelSaturation + ': <span id="' + MyConfig.CONTAINER_SELECTED_SATURATION + '" style="width: 25px; height: 25px; color: #111111;">-</span>' +
            '       </div>' +
            '</div>' +
            '<div id="' + MyConfig.CONTAINER_SET + '" style="clear: both; display: none; margin-top: 10px;">' +
            '   <div style="clear: both; height: 25px; line-height: 25px;">' +
            '       <input type="button" id="' + MyConfig.BUTTON_SET_VALUES + '" value="' + labelButtonSetValues + '" />' +
            '   </div>' +
            '   <div style="clear: both; height: 25px; line-height: 25px; padding-left: 25px; margin-top: 10px;">' + labelOr + '</div>' +
            '   <div id="' + MyConfig.CONTAINER_SELECT_PRESET + '" style="clear: both; margin-top: 10px;">' +
            '       <div style="float:left;">' + labelSetAColorPreset + ':</div>' +
            '       <div style="float:left; margin-left: 10px;">' +
            returnHTMLSelectForColorPresets() +
            '       </div>' +
            '       <div style="float:left; margin-left: 10px;">' +
            '           <input type="button" id="' + MyConfig.BUTTON_SET_PRESET_COLOR + '" style="display: none;" value="' + labelSetPresetColor + '" />' +
            '       </div>' +
            '       <div style="float:left; margin-left: 25px;" id="' + MyConfig.CONTAINER_FEEDBACK + '"></div>' +
            '   </div>' +
            '</div>' +
            '<canvas id="' + MyConfig.CANVAS_MARKER.ID + '" style="display: none; z-index: 200; position: absolute;" width="' + MyConfig.CANVAS_MARKER.WIDTH + '" height="' + MyConfig.CANVAS_MARKER.HEIGHT + '"></canvas>' +
            '</div>' +
            '<div class="clearfix">' +
            '<button id="save_scene_actions" class="setup_wizard_button pull-right flip saveBtn hidden" disabled="disabled">' + labelSaveSceneAction + '</button>' +
            '</div>' +
            '</div>';

        return html;
    }

    function handleClickOnSceneActionsSaveButton() {
        var sceneActionObj;
        var effectValue = getSelectedEffectValue(), transitionTimeValue = Utils.int($('#philips_hue_lamp_2_transition_time').val());
        var actionToRemove;
        if (sceneActionPickedValues['hue'] != -1 && sceneActionPickedValues['saturation'] != -1) {
            actionToRemove = ACTION_SET_COLOR_TEMP;
            sceneActionObj = {
                service: SID,
                action: ACTION_SET_HUE_AND_SATURATION,
                arguments: [
                    {
                        name: "Hue",
                        value: sceneActionPickedValues['hue']
                    },
                    {
                        name: "Saturation",
                        value: sceneActionPickedValues['saturation']
                    },
                    {
                        name: "Effect",
                        value: effectValue
                    },
                    {
                        name: "Transitiontime",
                        value: transitionTimeValue
                    }
                ]
            };
        } else if (sceneActionPickedValues['colorTemperature'] != -1) {
            actionToRemove = ACTION_SET_HUE_AND_SATURATION;
            sceneActionObj = {
                service: SID,
                action: ACTION_SET_COLOR_TEMP,
                arguments: [
                    {
                        name: "ColorTemperature",
                        value: sceneActionPickedValues['colorTemperature']
                    },
                    {
                        name: "Effect",
                        value: effectValue
                    },
                    {
                        name: "Transitiontime",
                        value: transitionTimeValue
                    }
                ]
            };
        }

        // call the api methods...
        if (typeof actionToRemove !== 'undefined') {
            api.removeSceneAction(SID, actionToRemove);
        }
        api.setSceneAction(sceneActionObj);
        api.closeSceneAction();
    }

    function handleSceneActionClickOnCanvases(e) {
        var previousColorTempWidth = MyConfig.CANVAS_COLOR_TEMP.WIDTH, previousHueSatWidth = MyConfig.CANVAS_HUE_SAT.WIDTH;
        MyConfig.CANVAS_COLOR_TEMP.WIDTH = canvasWidthForSceneActions;
        MyConfig.CANVAS_HUE_SAT.WIDTH = canvasWidthForSceneActions;
        var retVal = getValuesAtMousePosition(e.clientX, e.clientY);
        processSceneActionClickedValue(retVal, e.clientX, e.clientY);
        MyConfig.CANVAS_COLOR_TEMP.WIDTH = previousColorTempWidth;
        MyConfig.CANVAS_HUE_SAT.WIDTH = previousHueSatWidth;
    }

    function handleSceneActionChangeForEffectValue() {
        $('#save_scene_actions').removeAttr('disabled').removeClass('hidden');
    }

    function handleSceneActionChangeForTransitionTime() {
        $('#save_scene_actions').removeAttr('disabled').removeClass('hidden');
    }

    function attachSceneActionCanvasEventHandlers() {
        var $canvases = $('#' + MyConfig.CANVAS_HOLDER).find('canvas');

        $canvases.off('click').on('click', function (e) {
            e.stopPropagation();
            handleSceneActionClickOnCanvases(e);
        });

        $('#save_scene_actions').off('click').on('click', function(e){
            e.stopPropagation();
            handleClickOnSceneActionsSaveButton();
        });

        $('#philips_hue_lamp_2_effect').on('change', function(){
            handleSceneActionChangeForEffectValue();
        });

        $('#philips_hue_lamp_2_transition_time').on('keyup', function(){
            handleSceneActionChangeForTransitionTime();
        });
    }

    function processSceneActionClickedValue(retVal, x, y) {
        showMarkerAtMousePosition(retVal, x, y);
        sceneActionPickedValues = retVal;
        $('#save_scene_actions').removeAttr('disabled').removeClass('hidden');
    }

    function preselectSceneActionColorTemperature(actionArguments) {
        var colorTemperature = -1, i, x = 0, y = 0, effect, transitionTime = 50;
        for (i =0;i<actionArguments.length;i++) {
            var aa = actionArguments[i];
            if (aa['name'] == 'ColorTemperature') {
                colorTemperature = aa['value'];
            } else if (aa['name'] == 'Effect') {
                effect = aa['value'];
            } else if (aa['name'] == 'Transitiontime') {
                transitionTime = aa['value'];
            }
        }

        sceneActionPickedValues['colorTemperature'] = colorTemperature;

        var $canvas =  $('#' + MyConfig.CANVAS_COLOR_TEMP.ID), canvas = $canvas.get()[0];
        var width = $canvas.attr('width'), height = $canvas.attr('height'), foundInPreset;

        if (ALLOW_CT_PRESETS && CT_PRESETS.length > 0) {
            for (i=0;i<CT_PRESETS.length && typeof foundInPreset === 'undefined';i++) {
                var preset = CT_PRESETS[i];
                if (colorTemperature >= preset['Value'] - 5 && colorTemperature <= preset['Value'] + 5) {
                    foundInPreset = preset;
                }
            }
        }

        if (typeof foundInPreset !== 'undefined') {
            var $preset = $('#' + MyConfig.CANVAS_HOLDER).find('[data-preset_value="'+foundInPreset['Value']+'"]');
            var posX = Math.floor($preset.attr('data-preset_center_x') - MyConfig.CANVAS_MARKER.WIDTH / 2) - 1;
            var posY = Math.floor(MyConfig.CANVAS_MARKER.HEIGHT / 2);
            $('#' + MyConfig.CANVAS_MARKER.ID).css({
                'top': posY + 'px',
                'left': posX + 'px'
            }).show();
        } else {
            x = Math.floor((MyConfig.RANGES.ColorTemperature.left - colorTemperature) * (width - 1) / (MyConfig.RANGES.ColorTemperature.left - MyConfig.RANGES.ColorTemperature.right));
            y = Math.floor(MyConfig.CANVAS_COLOR_TEMP.HEIGHT / 2);

            x -= MyConfig.CANVAS_MARKER.WIDTH / 2;
            y -= MyConfig.CANVAS_MARKER.HEIGHT / 2;
            $('#' + MyConfig.CANVAS_MARKER.ID).css({
                'top': y,
                'left': x
            }).show();
        }

        // preselect effect...
        $('#philips_hue_lamp_2_effect').val(effect);

        // preselect transition time...
        $('#philips_hue_lamp_2_transition_time').val(transitionTime);
    }

    function preselectSceneActionHueAndSaturation(actionArguments) {
        var hue = -1, saturation = -1, i, effect, transitionTime = 50;
        for (i =0;i<actionArguments.length;i++) {
            var aa = actionArguments[i];
            if (aa['name'] == 'Hue') {
                hue = aa['value'];
            } else if (aa['name'] == 'Saturation') {
                saturation = aa['value'];
            } else if (aa['name'] == 'Effect') {
                effect = aa['value'];
            } else if (aa['name'] == 'Transitiontime') {
                transitionTime = aa['value'];
            }
        }

        sceneActionPickedValues['hue'] = hue;
        sceneActionPickedValues['saturation'] = saturation;

        var $canvas =  $('#' + MyConfig.CANVAS_HUE_SAT.ID), canvas = $canvas.get()[0];
        var width = $canvas.attr('width'), height = $canvas.attr('height');
        var x = Math.floor(hue * (width - 1) / 65535);
        var y = Math.floor((saturation - MyConfig.RANGES.Saturation.min) * height / (MyConfig.RANGES.Saturation.max - MyConfig.RANGES.Saturation.min));
        x -= MyConfig.CANVAS_MARKER.WIDTH / 2;
        y += MyConfig.CANVAS_HUE_SAT.TOP - MyConfig.CANVAS_MARKER.HEIGHT / 2;
        $('#' + MyConfig.CANVAS_MARKER.ID).css({
            'top': y,
            'left': x
        }).show();

        // preselect effect...
        $('#philips_hue_lamp_2_effect').val(effect);

        // preselect transition time...
        $('#philips_hue_lamp_2_transition_time').val(transitionTime);
    }

    function showHTMLContentForSceneAction() {
        var previousColorTempWidth = MyConfig.CANVAS_COLOR_TEMP.WIDTH, previousHueSatWidth = MyConfig.CANVAS_HUE_SAT.WIDTH;
        MyConfig.CANVAS_COLOR_TEMP.WIDTH = canvasWidthForSceneActions;
        MyConfig.CANVAS_HUE_SAT.WIDTH = canvasWidthForSceneActions;
        var html = returnHTMLContainerForSceneAction();
        api.setSceneActionContent(html);
        fillCanvases({
            inSceneAction: true
        });
        // draw canvas for marker...
        drawCanvasForMarker();
        MyConfig.CANVAS_COLOR_TEMP.WIDTH = previousColorTempWidth;
        MyConfig.CANVAS_HUE_SAT.WIDTH = previousHueSatWidth;
    }

    function sceneAction(opts) {
        // the html content...
        showHTMLContentForSceneAction();

        // event handlers...
        attachSceneActionCanvasEventHandlers();

        // preselect (if actions found)...
        if (typeof opts['actions'] !== 'undefined') {
            for (var i =0;i<opts['actions'].length;i++) {
                var action = opts['actions'][i];
                if (action['service'] == SID) {
                    sceneActionPickedValues = {
                        colorTemperature: -1,
                        hue: -1,
                        saturation: -1
                    };

                    switch (action['action']) {
                        case ACTION_SET_HUE_AND_SATURATION:
                            preselectSceneActionHueAndSaturation(action['arguments']);
                            break;
                        case ACTION_SET_COLOR_TEMP:
                            preselectSceneActionColorTemperature(action['arguments']);
                            break;
                        default:
                            break;
                    }
                }
            }
        }
    }

    myModule = {
        uuid: uuid,
        color_picker: color_picker,
        cleanup: cleanup,
        sceneList: sceneList,
        sceneAction: sceneAction
    };

    return myModule;
})(api); 
