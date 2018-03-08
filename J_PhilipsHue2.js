var PhilipsHue2 = (function (api) {

    // unique identifier for this plugin...
		var uuid 																					= 'CB5AC9AF-B9E5-4A24-86DF-BE085941E9F0';
		var myModule 																			= {};
		var deviceId 																			= api.getCpanelDeviceId();
		var HUE_SID 																			= "urn:micasaverde-com:serviceId:PhilipsHue1";
		var SID_DIMMING 																	= "urn:upnp-org:serviceId:Dimming1";
		var VARIABLE_HUE_BRIDGES 													= "Bridges";
		var VARIABLE_LOAD_LEVEL 													= "LoadLevelTarget";
		var VARIABLE_ACTION_LIST_SCENES 									= "ActionListScenes";
		var MAX_NUM_SCENES_IN_FAVORITES 									= 6;
		var WAIT_AFTER_RUN_HUE_SCENE 											= 15;
		var WAIT_AFTER_POLL_HUE_BRIDGE 										= 5;
		var MINIMUM_REQUIRED_API_VERSION 									= 12;
		var TIMER_REFRESH_LINK_STATUS 										= 5; // in seconds...
		var WAIT_AFTER_CLICK_ON_FAVORITES 								= 2; // in seconds...
		var WAIT_BEFORE_PERFORMING_GET_SCENE_VALUES 			= 5; // in seconds...
		var JS_VERSION 																		= 16;
		var deletedScene 																	= false;

		var hueStatus 																		= '';
		var bridgeLink;
		var deviceObj 																		= '';
		var selectedHueLights 														= [];
		var selectedHueDeviceLights												= [];
		var hueSceneObj 																	= {};
		var bridgeLightIdToUserDataLightId 								= null;
		var lightList 																		= [];
		var lightDeviceIdList 														= [];
		var editedSceneObj 																= null;
		var bridgeFavoriteScenesValue 										= false;
		var bridgeSceneList 															= [];
		var intervalRefreshLinkStatus;
		var savedSceneId 																	= "";
		var hueSceneValues;
		var currentTab;
		var bridgeSearchInterval;

    function cleanup(args) {
			// do some cleanup...
			clearInterval(intervalRefreshLinkStatus);
			clearInterval(bridgeSearchInterval);
    }

    function init(dId) {
        console.log("INIT for PhilipsHue2 version " + JS_VERSION);
        currentTab = 0;

        // register to events...
        api.registerEventHandler('on_ui_cpanel_before_close', myModule, 'cleanup');
        api.registerEventHandler('on_ui_cpanel_tab_changed', myModule, 'tabChanged');
        api.registerEventHandler('on_startup_luStatusLoaded', myModule, 'refreshSceneList');

        // check api version...
        if (typeof api.requiresVersion === 'function') {
            api.requiresVersion(MINIMUM_REQUIRED_API_VERSION, function (version) {
                var msg = Utils.getLabel(MyConfig.LABEL_MIN_API_VERSION);
                msg = msg.replace('_API_VERSION_', version);
                msg = msg.replace('_MINIMUM_REQUIRED_API_VERSION_', MINIMUM_REQUIRED_API_VERSION);
                console.log(msg);
				// api.showCustomPopup(msg, {
                    // category: MessageCategory.NOTIFICATION
                // });
            });
        }

        deviceId = typeof dId !== 'undefined' ? dId : api.getCpanelDeviceId();
        deviceObj = api.getDeviceObject(deviceId);
        hueStatus = api.getDeviceState(deviceId, HUE_SID, 'Status');
        bridgeLink = api.getDeviceState(deviceId, HUE_SID, 'BridgeLink');

        if (typeof intervalRefreshLinkStatus === 'undefined') {
            intervalRefreshLinkStatus = setInterval(function () {
                checkBridgeLinkStatus();
            }, TIMER_REFRESH_LINK_STATUS * 1000);
        }
    }

		function startLookingForBridges(deviceId, ip){

			var bridgesStateValue = application.getLuStatusStateVariable(deviceId, HUE_SID, VARIABLE_HUE_BRIDGES);
			console.log("looking for bridges");
			if(bridgesStateValue === false){
				return;
			}
			console.log("found bridges");
			clearInterval(bridgeSearchInterval);

			bridgesStateValue = bridgesStateValue.split(';');
			var numberOfIPs = bridgesStateValue.length-1;
			var bridgeName = [];
			var bridgeIP = [];
			var bridgeMAC = [];

			var thead =	'<thead>'+
									'	<tr>'+
				 					'		<th>' + Utils.getLangString("report_name", "Name") + '</th>'+
									'		<th>' + Utils.getLangString("ui7_philipsHue2_ip", "IP") + '</th>'+
									'		<th>' + Utils.getLangString("ui7_philipsHue2_useThisOne", "Use this one") + '</th>'+
									'	</tr>'+
		 							'</thead>'+
									'<tbody id="found_hue_brigde_list_body"></tbody>';
			$("#found_hue_bridge_list").html(thead);

			for(var i=0;i<numberOfIPs;i++){
				var bridgeDataSet = bridgesStateValue[i].split(',');
				bridgeName[i] = bridgeDataSet[0];
				bridgeIP[i] = bridgeDataSet[1];
				
				try{
					// bridge id contains mac address - extract last hald
					var id = bridgeDataSet[2];
					id = id.substr(id.length - 6, id.length);
					id = id.split("");
					id.splice(2, 0, ":");id.splice(5, 0, ":");
					var msg = Utils.getLangString("ui7_mac_ending_in", "MAC ending in _TO_REPLACE_MAC_ADDR_");
					msg = msg.replace("_TO_REPLACE_MAC_ADDR_", id.join(""));
					
					bridgeMAC[i] = " (" + msg + ")";
				} catch(ee) {}
			}

			var htmlTableContent = "";

			for(var i = 0;i < numberOfIPs;i++){
				htmlTableContent +=	'<tr>'+
														'	<td>'+ bridgeName[i] + (typeof bridgeMAC[i] !== "undefined" ? bridgeMAC[i] : "") + '</td> '+
														'	<td>'+ bridgeIP[i] + '</td> '+
														'	<td>'+
														'		<div class="radio" id="bridgeRadio_'+ i +'">'+
														'			<input type="radio" name="optradio">'+
														'		</div>'+
														'	</td> '+
														'</tr>';
			}

			$("#found_hue_brigde_list_body").html(htmlTableContent);

			if(ip !== ''){
				for(var j=0;j<numberOfIPs;j++){
					if(ip == bridgeIP[j]){
						$("#bridgeRadio_" + j + " input").prop("checked", true);
					}
				}
			}

			$('input:radio').on('change', function(){
				var getRadioIndex = $(this).parent().attr('id').split('_');
				getRadioIndex = getRadioIndex[1];
				$('#philyHueIp').val(bridgeIP[getRadioIndex]);
			});

			$('#philyHueIp').blur(function(){
				var manualIp = Utils.trim(document.querySelector('#philyHueIp').value);
				for(var j=0;j<numberOfIPs;j++){
					if(manualIp == bridgeIP[j]){
						$("#bridgeRadio_" + j + " input").prop("checked", true);
					}
				}
			});
		}

    function configure(deviceId) {
				try {
						$('#plugin_wizard_configuration_step_container').length === 1 ?
								init(deviceId) : init();

						currentTab = 1;

						var status = !!hueStatus ? hueStatus : '';

						var htmlTable = '<table style="width:50%; margin-top:20px; margin-bottom:10px;" id="found_hue_bridge_list">'+
														'	<tr>'+
														'		<td style="text-align: center;">'+
														'			<img src="skins/default/img/other/loaderGreenBig.gif" alt="' + Utils.getLangString("ui7_please_wait", "Please Wait") + '" />'+
														'			<br/>'+
																	Utils.getLangString("ui7_philips_hue_looking_for_bridges", "Looking for bridges") +
														'		</td>'+
														'	</tr>'+
														'</table>';

						var statusView = bridgeLink == 1 ? returnBridgeConnected() : returnBridgeNotConnected(hueStatus);

						var ip = !!deviceObj.ip ? deviceObj.ip : '';

						var html = 	'<div class="clearfix philipsBridgeContainer" id="' + MyConfig.CONTAINER_BRIDGE_CONFIGURE + '">' +
						 						'	<div class="legendHeader"><h3>' + Utils.getLangString("ui7_connectivity", "Connectivity") + '</h3></div>' +
											 	'	<div class="cpanelSection">' +
											 	'		<div class="clearfix">' +
											 	'			<div class="pull-left boldLabel linkLabelStatusContainer">' + Utils.getLangString("ui7_linkStatus", "Link Status") + '</div>' +
											 	'     <div class="pull-right linkStatusContainer" data-container="bridge_status_container">' + statusView + '</div>' +
											 	'		</div>' +
											 	'	</div>' +
											 	'	<div class="cpanelSection clearfix">' +
											 	'    	<div class="pull-left autoconfigureBridgeContainer">' +
											 	'        	<div class="boldLabel">' + Utils.getLangString("ui7_autoConfigure_bridge", "Configure") + '</div>' +
											 	'            <div class="pluginInputLabel">' + Utils.getLangString("ui7_linkToHueController", "Link to Hue controller:") + '</div>' +
											 	'        </div>' +
											 	'        <div class="pull-right pairBridgeContainer"><button class="vBtn lowInteraction" id="philyHueEstablishLinkBtn">' + Utils.getLangString("ui7_pairWithBridge_hue", "Pair With Bridge") + '</button></div>'+
						 						'	</div>';


						html+= htmlTable;


						// for oro add different token

						if(typeof config !== 'undefined' && typeof config.PK_Oem !== 'undefined' && parseInt(config.PK_Oem) === 48){
							html +=	'		<div style="font-weight: bold; font-size: 18px !important">' + Utils.getLangString("ui7_hue_bridge_ip_explain", "The form below allows you to set the bridge ip in case that an error occurred and _UNIT_NAME_ cannot find it anymore.") + '</div>';
						} else {
							html += '		<div style="font-weight: bold; font-size: 18px !important">' + Utils.getLangString("ui7_general_ucase_or", "OR") + '</div>';
						}

						html += 	'	<div class="cpanelSection">' +
											'		<div class="clearfix bridgeManuallyConfigureContainer">' +
											'<div class="pull-left">' +
											'		<div class="boldLabel">' + Utils.getLangString("ui7_manuallyConfigure", "Manually Configure") + '</div >' +
											'			<div class="pluginInputLabel"><span>' + Utils.getLangString("ui7_general_ucase_ip", "IP") + ':</span><input type="text" class="device_cpanel_input_text" id="philyHueIp" name="philyHueIp" value="' + ip + '"/></div>' +
											'</div>' +
											'			<div class="pull-right bridgeSaveIpContainer"><button class="vBtn lowInteraction" style="text-transform: none !important;" id="setPhilyHueIp">' + Utils.getLangString("ui7_save_hue_ip", "Save") + '</button></div>' +
											'		</div>' +
											'	</div>' +
											'</div>';

						$('#plugin_wizard_configuration_step_container').length === 1 ?
								$('#plugin_wizard_configuration_step_container').html(html) : api.setCpanelContent(html);

						bridgeSearchInterval = setInterval(function(){
							startLookingForBridges(deviceId, ip);
						}, 1000);

						handlePluginActions();
						
						// hide the cpanel controls container as this isn't used
						// and takes a lot of space
						$('#cpanel_control_container').hide();
				} catch (e) {
						Utils.logError('Error in PhilipsHue2.configure(): ' + e);
				}
		}

    function checkBridgeLinkStatus() {
        hueStatus = api.getDeviceState(deviceId, HUE_SID, 'Status');
        bridgeLink = api.getDeviceState(deviceId, HUE_SID, 'BridgeLink');
        var statusView = bridgeLink == 1 ? returnBridgeConnected() : returnBridgeNotConnected(hueStatus);
        if (statusView !== false) {
            $('#' + MyConfig.CONTAINER_BRIDGE_CONFIGURE).find('[data-container="bridge_status_container"]').html(statusView);
        }
        // if in wizard config mode and the bridge is paired we exit the screen
        if ($(View.idForWizardTemplate6PluginConfigurationContainer()).length === 1 &&
            Utils.int(bridgeLink) === 1
        ) {          
            setTimeout(function () {
                myInterface.runItem('ui_view_devices_all');
				myInterface.showModalLoading();
            }, 3 * 1000);
			setTimeout(function () {
              myInterface.startedWizardFlag = false;
              myInterface.hideModalLoading();
            },12 * 1000);
        }
    }

    function returnBridgeConnected() {
        var html = '<div class="bridgeConnected">' + Utils.getLangString("ui7_Connected", "Connected") + '</div>';
        return html;
    }

    function returnBridgeNotConnected(opt_msg) {

        var html = '<div class="bridgeNotConnected">';
        if (typeof opt_msg !== 'undefined' && opt_msg.length > 0) {
            html += '<div>' + opt_msg + '</div>';
        } else {
            return false;
        }
        //} else {
        //html += '<div>' + Utils.getLangString("ui7_bridegeNotConnected", "IP address could not be automatically set.") + '</div>' +
        //'<div>' + Utils.getLangString("ui7_bridegeNotConnectedInfo", "Please add it in IP field, save and reload the engine.") + '</div>';
        //}
        html += '</div>';
        return html;
    }

    function createListOfAvailableLightsForHueScene() {
        var list = [];
        if (typeof hueSceneObj['groups'] !== 'undefined') {
            for (var k = 0; k < selectedHueLights.length; k++) {
                var found = false;
                for (var i = 0; i < hueSceneObj['groups'].length && !found; i++) {
                    var g = hueSceneObj['groups'][i];
                    if (typeof g['lights'] !== 'undefined') {
                        for (var j = 0; j < g['lights'].length && !found; j++) {
                            if (g['lights'][j] == selectedHueLights[k]) {
                                found = true;
                            }
                        }
                    }
                }

                if (!found) {
                    list.push(selectedHueLights[k]);
                }
            }
        } else {
            for (var t = 0; t < selectedHueLights.length; t++) {
                list.push(selectedHueLights[t]);
            }
        }

        hueSceneObj['currentGroup'] = {
            lights: list
        };
    }

    function returnSceneListAvailableLights() {
        var labelChooseLights = Utils.getLabel(MyConfig.LABEL_CHOOSE_LIGHTS_FOR_COLOR);

        var listOfAvailableLigths = hueSceneObj['currentGroup']['lights'];

        var html = '<div id="hue_scene_list_available_lights_' + deviceId + '">';
        html += '<div class="clearfix">' + labelChooseLights + '</div>';
        html += '<div class="clearfix" data-container="available_lights">';
        for (var i = 0; i < listOfAvailableLigths.length; i++) {
            var localLightObj = undefined;
            for (var j = 0; j < lightList.length && typeof localLightObj === 'undefined'; j++) {
                if (lightList[j]['id'] == listOfAvailableLigths[i]) {
                    localLightObj = lightList[j];
                }
            }
            if (typeof localLightObj !== 'undefined') {
                html += '<div class="clearfix hueLightRow cursor_pointer" data-checked="1" data-available_light="' + listOfAvailableLigths[i] + '">' +
                '   <div class="pull-left flip wifi_network_item_name">' + localLightObj['id'] + '. ' + localLightObj['name'] + '</div>' +
                '   <div data-light_id="' + listOfAvailableLigths[i] + '" data-container="checkbox" class="pull-right flip create_scene_select_mode_row_check checked"></div>' +
                '</div>';
            }
        }
        html += '</div>';

        html += '<div class="clearfix margin_top_10 hidden">' + Utils.getLabel(MyConfig.LABEL_SET_EFFECT) + '</div>';
        html += '<div class="philips_hue_2_lightness_container clearfix hidden">' +
        '   <div class="pull-left philips_hue_2_lightness_label" style="font-weight: bold;">' + Utils.getLabel(MyConfig.LABEL_EFFECT) + ':</div>' +
        '<div class="pull-left margin_left_5">' +
        '   <select id="philips_hue_2_effect">' +
        '       <option value="none">'+Utils.getLabel(MyConfig.LABEL_EFFECT_NONE)+'</option>' +
        '       <option value="colorloop">'+Utils.getLabel(MyConfig.LABEL_EFFECT_COLOR_LOOP)+'</option>' +
        '   </select>' +
        '</div>' +
        '<div class="clearfix"></div>'+
        '</div>';

        html += '<div class="clearfix margin_top_5">' + Utils.getLabel(MyConfig.LABEL_ADJUST_LIGHTNESS_FOR_LIGHTS) + '</div>';
        html += '<div class="philips_hue_2_lightness_container clearfix">' +
        '   <div class="pull-left philips_hue_2_lightness_label" style="font-weight: bold;">' + Utils.getLangString("ui7_lightness", "Lightness") + '</div>' +
        '   <div class="pull-left philips_hue_2_lightness_value" id="' + MyConfig.LIGHTNESS_VALUE.ID + '">50%</div>' +
        '   <div id="' + MyConfig.LIGHTNESS_SLIDER.ID + '" class="pull-left philips_hue_2_lightness_slider"></div>' +
        '</div>';

        html += '</div>';

        return html;
    }

    function handlePluginActions() {
        try {
            var establishLink = document.querySelector('#philyHueEstablishLinkBtn');
            establishLink.addEventListener('click', establishHueLink);

            var setPhilyIp = document.querySelector('#setPhilyHueIp');
            setPhilyIp.addEventListener('click', setPhilyHueIp);
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.handlePluginAction(): ' + err);
        }
    }

    function establishHueLink(e) {
        try {
            api.showCustomPopup(Utils.getLabel(MyConfig.LABEL_BRIDGE_PAIRING_IN_PROCESS), {
                autoHide: 3
            });
            api.performLuActionOnDevice(deviceId, HUE_SID, 'BridgeConnect', {
                onSuccess: establishHueLinkSuccess,
                onFailure: establishHueLinkError,
                context: PhilipsHue2
            });
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.establishHueLink(): ' + err);
        }
    }

    function establishHueLinkSuccess() {
        try {
            setTimeout(function () {
                checkBridgeLinkStatus();
                myInterface.startedWizardFlag = false;
                //hueStatus = api.getDeviceState(deviceId, HUE_SID, 'Status');
                //var status = !!hueStatus ? hueStatus : '';
                //document.querySelector('#philyHueLinkStatus').innerHTML = status;
            }, 1000);
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.establishHueLinkSuccess(): ' + err);
        }
    }

    function establishHueLinkError() {
        try {
            checkBridgeLinkStatus();
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.establishHueLinkError(): ' + err);
        }
    }

    function setPhilyHueIp(e) {
        try {
            var ip = Utils.trim(document.querySelector('#philyHueIp').value);
            //api.setDeviceAttribute(deviceId, 'ip', ip);
                api.performLuActionOnDevice(deviceId, "urn:micasaverde-com:serviceId:PhilipsHue1", "SetBridgeIp", {
                    actionArguments: {
                        bridgeIP: ip
                    },
                    onSuccess: function () {
                        console.log("Bridge IP Sent Succesfully");
                    },
                    onFailure: function () {
                        console.log('ERROR Bridge IP Not Sent !');
                    }
                });

        } catch (err) {
            Utils.logError('Error in PhilipsHue2.setPhilyHueIp(): ' + err);
        }
    };

    function sceneList(deviceId) {
        try {
            bridgeSceneList = getHueSceneList(deviceId, {
                sortByName: true
            });
            lightList = getBridgeHueLightsList(deviceId);
            lightDeviceIdList = application.getDeviceChildenIdList(deviceId);
            bridgeFavoriteScenesValue = api.getDeviceState(deviceId, "urn:micasaverde-com:serviceId:PhilipsHue1", "BridgeFavoriteScenes");
            var sceneListView = returnSceneListView(bridgeSceneList);
            api.setCpanelContent(sceneListView);
            addBehaviorToSceneButtons();
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.sceneList(): ' + err);
        }
    }

    function getHueSceneList(deviceId, options) {
        try {
            var sortByName = (typeof options != 'undefined' && typeof options['sortByName'] != 'undefined') ? options['sortByName'] : false;

            bridgeSceneList = [];

            var sceneString = api.getDeviceState(deviceId, "urn:micasaverde-com:serviceId:PhilipsHue1", "BridgeScenes");
            var scenesObj = JSON.parse(sceneString);
            for (var scene in scenesObj) {
                if (scenesObj.hasOwnProperty(scene)) {
                    bridgeSceneList.push({id: scene, name: scenesObj[scene].name, lights: scenesObj[scene].lights, version: scenesObj[scene].version});
                }
            }

            if (sortByName) {
                var swapped;
                var n = bridgeSceneList.length;
                do {
                    swapped = false;
                    for (var i = 0; i < n - 1; i++) {
                        if (bridgeSceneList[i]['name'] > bridgeSceneList[i + 1]['name']) {
                            var aux = bridgeSceneList[i];
                            bridgeSceneList[i] = bridgeSceneList[i + 1];
                            bridgeSceneList[i + 1] = aux;
                            swapped = true;
                        }
                    }
                    n = n - 1;
                } while (swapped);
            }

            return bridgeSceneList;
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.getHueSceneList(): ' + err);
        }
    }

    function returnSceneListView(bridgeSceneList) {
        try {
            console.log('returnSceneListView - ' + bridgeSceneList.length);
            var html = '<div class="philipsSceneListContainer">' +
                '   <div class="clearfix">' +
                '       <div class="pull-left flip clearfix devicesFavoritesContainer">' +
                '           <div class="pull-left flip select_favorites_title">' +
                '               <span>' + Utils.getLangString("ui7_click", "Click") + '</span>' +
                '               <span class="icon-unpinned_device"></span>' +
                '               <span>' + Utils.getLangString("ui7_toSelectFavorites_hue", "to select favorites") + '</span>' +
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
                '       <th class="hueSceneList-run col-md-2 col-sm-2 col-xs-2">' + Utils.getLangString("ui7_general_ucase_run", "Run") + '</th>' +
                '       <th class="hueSceneList-delete col-md-2 col-sm-2 col-xs-2">' + Utils.getLangString("ui7_general_ucase_delete", "Delete") + '</th>' +
                '       <th class="hueSceneList-favorites col-md-2 col-sm-2 col-xs-2">' + Utils.getLangString("ui7_general_ucase_favorites", "Favorites") + '</th>' +
                '   </tr>' +
                '</thead>' +
                '<tbody id="hueBridgeSceneList">';

            if (typeof bridgeSceneList !== 'undefined' && bridgeSceneList.length > 0) {
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
    }

    function returnSceneRowContent(sceneObj) {
        try {
            //console.log("returnSceneRowContent");
            var favorite = "", sceneName = '';
            var bridgeFavoriteSceneList = [];
            //var bridgeFavoriteScenesValue = api.getDeviceState(deviceId, "urn:micasaverde-com:serviceId:PhilipsHue1", "BridgeFavoriteScenes");
            //console.log("sceneObj.id", sceneObj.id);
            //console.log("bridgeFavoriteScenesValue", bridgeFavoriteScenesValue);
            if (bridgeFavoriteScenesValue) {
                bridgeFavoriteSceneList = bridgeFavoriteScenesValue.split(",");
            }
            //console.log("bridgeFavoriteSceneList", bridgeFavoriteSceneList);
            if (Utils.inArray(sceneObj.id, bridgeFavoriteSceneList)) {
                favorite = "favorite";
            }
            sceneName = getDisplayedSceneName(sceneObj.name);
            var html = '<tr id="">' +
                '   <td class="alignVerticalMiddle">' +
                '       <span data-edit-scene-id="' + sceneObj.id + '" title="' + Utils.getLangString("ui7_scene_edit_program", "Edit Scene") + '" class="blockSpan icon-scene_edit_button pull-left"></span>' +
                '       <span class="pull-left flip hue-scene-name">' + sceneName + '</span>' +
                '   </td>' +
                '   <td class="alignVerticalMiddle hueSceneList-run">' +
                '       <span data-run_scene_id="' + sceneObj.id + '" title="' + Utils.getLangString("ui7_sceneRun", "Run") + '" class="blockSpan scenes_scene_play_button"></span>' +
                '   </td>';
	if(sceneObj.version == 2){
		html+='   <td class="alignVerticalMiddle hueSceneList-delete">' +
			  '       <span data-delete-scene-id="' + sceneObj.id + '" title="' + Utils.getLabel(MyConfig.LABEL_DELETE_SCENE) + '" class="blockSpan icon-create_scene_trigger_button_remove"></span>' +
              '   </td>';
				}else{
		html+='   <td class="alignVerticalMiddle hueSceneList-delete">' +
			  '       <span data-delete-scene-id="' + sceneObj.id + '" style="pointer-events:none!important;display:none;" title="' + Utils.getLabel(MyConfig.LABEL_DELETE_SCENE) + '" class="blockSpan icon-create_scene_trigger_button_remove"></span>' +
              '   </td>';
				}
		html+='   <td class="alignVerticalMiddle text_align_center">' +
                '       <span data-favorite-scene-id="' + sceneObj.id + '" title="' + Utils.getLangString("ui7_favoriteScene", "Favorite Scene") + '" class="blockSpan device_unpinned ' + favorite + '"></span>' +
                '   </td>' +
                '</tr>';
            return html;
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.returnSceneRowContent(): ' + err);
        }
    }

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
                    handleClickOnSceneFavoriteButton(sceneId);
                });
            });
            $("#hueBridgeSceneList").find("[data-run_scene_id]").each(function () {
                $(this).off('click').on('click', function () {
                    var sceneId = $(this).attr("data-run_scene_id");
                    api.showLoadingOverlay().then(function () {
                        runHueScene(sceneId, {
                            onSuccess: function () {
                                api.showCustomPopup(Utils.getLabel(MyConfig.LABEL_SCENE_RUN_SUCCESS), {
                                    autoHide: 3
                                });
                                api.hideLoadingOverlay();
                            },
                            onFailure: function () {
                                api.hideLoadingOverlay();
                            }
                        });
                    });
                });
            });
            $("#createHueSceneBtn").off().on("click", function () {
                hueSceneObj = null;
                createHueScene();
            });
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.addBehaviorToSceneButtons(): ' + err);
        }
    }

    function editHueScene(sceneId) {
        try {
            console.log("editHueScene");
            console.log("scene id:", sceneId);
            var sceneObjEdit = getHueSceneById(sceneId);
            console.log("sceneObjEdit", sceneObjEdit);
            editedSceneObj = sceneObjEdit;
            createHueScene("calledFromEdit");
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.editHueScene(): ' + err);
        }
    }

    function getHueSceneById(sceneId) {
        try {
            //console.log("getHueSceneById");
            //console.log("sceneId", sceneId);
            //var sceneList = getHueSceneList(deviceId)

            for (var i = 0; i < bridgeSceneList.length; i++) {
                if (String(bridgeSceneList[i].id) === String(sceneId)) {
                    return bridgeSceneList[i];
                }
            }
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.getHueSceneById(): ' + err);
        }
    }

    function deleteHueScene(sceneId) {
        try {
            console.log("deleteHueScene " + sceneId);
            api.showCustomPopup(Utils.getLangString("ui7_scene_confirm_delete", "Are you sure you want to delete this scene ?"), {
                category: 'confirm',
                onSuccess: function () {
                    sendDeleteHueSceneCommand(sceneId);
                }
            });
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.deleteHueScene(): ' + err);
        }
    }

    function handleClickOnSceneFavoriteButton(sceneId) {

        api.showLoadingOverlay().then(function () {
            var txtFavoriteList = api.getDeviceState(deviceId, HUE_SID, "BridgeFavoriteScenes");
            var favoriteList = [], operationType = 0;

            if (typeof txtFavoriteList !== 'undefined' && txtFavoriteList !== false) {
                favoriteList = txtFavoriteList.split(',');
            }
            if (!Utils.inArray(sceneId, favoriteList)) {
                favoriteList.push(sceneId);
                operationType = 1;
            } else {
                for (var i = 0; i < favoriteList.length; i++) {
                    if (favoriteList[i] == sceneId) {
                        favoriteList.splice(i, 1);
                        i--;
                    }
                }
                operationType = 2;
            }

            if (favoriteList.length > MAX_NUM_SCENES_IN_FAVORITES) {
                api.showCustomPopup(Utils.getLabel(MyConfig.LABEL_TOO_MANY_FAVORITES_ADDED));
                api.hideLoadingOverlay();
            } else {
                txtFavoriteList = favoriteList.join(',');

                Q.delay(WAIT_AFTER_CLICK_ON_FAVORITES * 1000).then(function () {
                        api.setDeviceStatePersistent(deviceId, HUE_SID, "BridgeFavoriteScenes", txtFavoriteList, {
                            onSuccess: function () {
                                if (operationType == 1) {
                                    $('[data-favorite-scene-id="' + sceneId + '"]').addClass('favorite');
                                } else if (operationType == 2) {
                                    $('[data-favorite-scene-id="' + sceneId + '"]').removeClass('favorite');
                                }

                                // TODO: to be replaced with a proper API call...
                                myInterface.updatePhilipsHueBridgeScenes(deviceId, bridgeLink);
                                //api.triggerDeviceStatusChanged(deviceId);
                                api.hideLoadingOverlay();
                            },
                            onFailure: function () {
                                api.hideLoadingOverlay();
                            }
                        });
                    }
                );
            }
        }).fail(function () {
            api.hideLoadingOverlay();
        });
    }

    /*
     function favoriteHueScene(sceneId) {
     try {
     console.log("favoriteHueScene");
     console.log("scene id:", sceneId);
     myInterface.showModalLoading();
     var bridgeFavoriteSceneList = [];
     var bridgeFavoriteScenesValue = api.getDeviceState(deviceId, "urn:micasaverde-com:serviceId:PhilipsHue1", "BridgeFavoriteScenes");
     if (bridgeFavoriteScenesValue) {
     bridgeFavoriteSceneList = bridgeFavoriteScenesValue.split(",");
     } else {
     api.setDeviceStatePersistent(deviceId, "urn:micasaverde-com:serviceId:PhilipsHue1", "BridgeFavoriteScenes", sceneId, {
     onSuccess: function () {
     $('[data-favorite-scene-id="' + sceneId + '"]').addClass('favorite');
     myInterface.updatePhilipsHueBridgeScenes(deviceId, bridgeLink);
     myInterface.hideModalLoading();
     },
     onFailure: function(){
     myInterface.hideModalLoading();
     }
     }
     );
     }

     var hueSceneFavoriteString = '';

     if (Utils.inArray(sceneId, bridgeFavoriteSceneList)) {
     removeElemFromArray(sceneId, bridgeFavoriteSceneList);
     hueSceneFavoriteString = bridgeFavoriteSceneList.join(",");
     api.setDeviceStatePersistent(deviceId, "urn:micasaverde-com:serviceId:PhilipsHue1", "BridgeFavoriteScenes", hueSceneFavoriteString, {
     onSuccess: function () {
     $('[data-favorite-scene-id="' + sceneId + '"]').removeClass('favorite');
     myInterface.updatePhilipsHueBridgeScenes(deviceId, bridgeLink);
     myInterface.hideModalLoading();
     },
     onFailure: function(){
     myInterface.hideModalLoading();
     }
     });
     } else {
     if (bridgeFavoriteSceneList.length > MAX_NUM_SCENES_IN_FAVORITES) {
     myInterface.hideModalLoading();
     api.showCustomPopup(Utils.getLabel(MyConfig.LABEL_TOO_MANY_FAVORITES_ADDED));
     } else {
     bridgeFavoriteSceneList.push(sceneId);
     hueSceneFavoriteString = bridgeFavoriteSceneList.join(",");
     api.setDeviceStatePersistent(deviceId, "urn:micasaverde-com:serviceId:PhilipsHue1", "BridgeFavoriteScenes", hueSceneFavoriteString, {
     onSuccess: function () {
     $('[data-favorite-scene-id="' + sceneId + '"]').addClass('favorite');
     myInterface.updatePhilipsHueBridgeScenes(deviceId, bridgeLink);
     myInterface.hideModalLoading();
     },
     onFailure: function(){
     myInterface.hideModalLoading();
     }
     });
     }
     }

     var txtActionListHueScenes = '', arr = [];
     for (var i = 0; i < bridgeFavoriteSceneList.length; i++) {
     var hso = getHueSceneById(bridgeFavoriteSceneList[i]);
     if (typeof hso !== 'undefined' && typeof hso['name'] !== 'undefined') {
     arr.push(bridgeFavoriteSceneList[i]);
     arr.push(getDisplayedSceneName(hso['name']));
     }
     }
     txtActionListHueScenes = arr.join(';');
     //console.log('txtActionListHueScenes: |' + txtActionListHueScenes + '|');
     api.setDeviceStatePersistent(deviceId, SID, VARIABLE_ACTION_LIST_SCENES, txtActionListHueScenes);
     } catch (err) {
     Utils.logError('Error in PhilipsHue2.favoriteHueScene(): ' + err);
     }
     }
     */

    function createHueScene() {
        try {
            var inEditMode = true;
            if (typeof arguments[0] === "undefined") {
                editedSceneObj = null;
                inEditMode = false;
            }

            var createSceneView = returnCreateHueScene(lightList, lightDeviceIdList, inEditMode);
            api.setCpanelContent(createSceneView);
            addBehaviorToCreateHueSceneBtn();
            checkSelectAllButton();
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.createHueScene(): ' + err);
        }
    }

    function getBridgeHueLightsList(deviceId) {
        try {
            var lightsString = api.getDeviceState(deviceId, HUE_SID, "BridgeLights");
		  var lampChildsIds = application.getDeviceChildenIdList(deviceId);

            if (typeof lightsString !== 'undefined' && lightsString) {
                var lights = lightsString.split(";");
                var lightList = [];
                for (var i = 0; i < lights.length; i++) {
                    var innerLights = lights[i].split(",");
				var lightName = application.getDeviceById(lampChildsIds[i]).name;
                    //lightList.push({id: innerLights[0], name: innerLights[1]});
				lightList.push({id: innerLights[0], name: lightName});
                }
            }

            return lightList;
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.getBridgeHueLightsList(): ' + err);
        }
    }

    function returnCreateHueScene(lightList, lightDeviceIdList, opt_inEditMode) {
        try {
            var html = '<div class="createHueSceneContainer">' +
                '<div class="hueLightsContainer" id="hueLightsContainer">' + returnHueLights(lightList, lightDeviceIdList) + '</div>' +
                '<div class="hueAddToRoomContainer">' + returnHueAddToRoom() + '</div>' +
                '<div class="hueNameSceneContainer">' + returnHueNameScene(opt_inEditMode) + '</div>' +
                '<div class="clearfix">' +
                '<div id="saveHueScene" class="setup_wizard_button pull-right flip saveBtn">' + Utils.getLangString("ui7_scenes_next_step", "Next Step") + '</div>' +
                '</div>' +
                '</div>';
            return html;
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.returnCreateHueScene(): ' + err);
        }
    }

    function returnHueLights(lightList, lightDeviceIdList) {
        try {
            selectedHueLights = [];
            selectedHueDeviceLights = [];

            var html = '<div class="clearfix">' +
                '       <div class="scenes_button_cancel" id="philips_hue_2_button_cancel_scene_edit">' + Utils.getLangString("ui7_general_ucase_cancel", "Cancel") + '</div>' +
                '</div>' +
                '<div class="legendHeader" style="margin-top: 5px;">' +
                '   <div style="float: left;">' +
                '           <h3>' + Utils.getLangString("ui7_lights", "Lights") + '</h3>' +
                '   </div>' +
                '   <div style="float: right;">' +
                '<div class="scenes_button_cancel" id="selectHueLights" data-selected="false">' + Utils.getLangString("ui7_selectAll", "Select All") + '</div>' +
                '   </div>' +
                '   <div style="clear: both;"></div>' +
                '</div>';

            if (typeof lightList !== 'undefined' && lightList.length > 0) {
                for (var i = 0; i < lightList.length; i++) {
                    html += returnHueLightRow(lightList[i], lightDeviceIdList[i], i);
                }
            } else {
                html += '<p style="font-weight: bold; color: #FF0000;">' + Utils.getLabel(MyConfig.LABEL_NO_LIGHTS_CONNECTED) + '</p>';
            }
            return html;
        } catch (err) {

        }
    }

    function returnHueAddToRoom() {
        return '';
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
    }

    function returnHueNameScene(opt_inEditMode) {
        try {
            var inEditMode = (typeof opt_inEditMode !== 'undefined') ? opt_inEditMode : false;
            var splits;

            var hueSceneName = "", sceneName = '', attrReadOnly = '', styleReadOnly = 'display: none;';
            if (editedSceneObj && editedSceneObj != null) {
                hueSceneName = editedSceneObj.name;

                sceneName = hueSceneName;
                if (editedSceneObj['version'] < 2) {
                    splits = hueSceneName.split(' ');
                    if (typeof splits[0] !== 'undefined') {
                        sceneName = splits[0];
                    }
                    sceneName = getDisplayedSceneName(hueSceneName);
                    attrReadOnly = ' readonly="readonly"';
                    styleReadOnly = '';
                }
            } else if (typeof hueSceneObj !== 'undefined' && hueSceneObj != null) {
                hueSceneName = hueSceneObj['name'];
                sceneName = getDisplayedSceneName(hueSceneName);
            }

            if (inEditMode && editedSceneObj != null && editedSceneObj['version'] < 2) {
                sceneName = getDisplayedSceneName(hueSceneName);
            }

            var html = '<div class="legendHeader"><h3>' + Utils.getLangString("ui7_nameYourScene", "Name Your Scene") + '</h3></div>' +
                '   <div class="pluginInputLabel">' +
                '       <span">' + Utils.getLangString("ui7_general_ucase_name", "Name") + ':</span>' +
                '       <input maxlength="32" class="device_cpanel_input_text" type="text" id="newHueSceneName" value="' + sceneName + '" ' + attrReadOnly + '/>' +
                '       <span style="' + styleReadOnly + '">' + Utils.getLangString("ui7_hue_scene_name_no_change", "The scene name cannot be changed.") + '</span>' +
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
            //console.log("returnHueLightRow");
            //console.log(arguments);
            var slectedLight = 0;
            var checkedLight = "";
            var alreadyAdded = false;
            //console.log("editedSceneObj", editedSceneObj);
            if (editedSceneObj) {
                //console.log(editedSceneObj);
                if (Utils.inArray(lightObj.id, editedSceneObj.lights)) {
                    slectedLight = 1;
                    checkedLight = "checked";
                    if (!alreadyAdded) {
                        selectedHueLights.push(lightObj.id);
                        selectedHueDeviceLights.push(lightDeviceId);
                        alreadyAdded = true;
                    }
                }
            }
            if (hueSceneObj && typeof hueSceneObj.lights !== 'undefined' && hueSceneObj.lights.length > 0) {
                if (Utils.inArray(lightObj.id, hueSceneObj.lights)) {
                    slectedLight = 1;
                    checkedLight = "checked";
                    if (!alreadyAdded) {
                        selectedHueLights.push(lightObj.id);
                        selectedHueDeviceLights.push(lightDeviceId);
                        alreadyAdded = true;
                    }
                }
            }
            var html = '<div class="clearfix hueLightRow">' +
                '   <div class="pull-left flip wifi_network_item_name">' + lightObj.id + '. ' + lightObj.name + '</div>' +
                '   <div data-light-device-userdata-id="' + lightDeviceId + '" data-checked="' + slectedLight + '" data-hue-light-select-id="' + lightObj.id + '" class="pull-right flip create_scene_select_mode_row_check ' + checkedLight + '"></div>' +
                '</div>';
            return html;
        } catch (e) {
            Utils.logError('Error in PhilipsHue2.returnHueLightRow(): ' + e);
        }
    }

    function checkSelectAllButton() {
        var numSelected = 0, numTotal = $("#hueLightsContainer").find("[data-hue-light-select-id]").length;
        $("#hueLightsContainer").find("[data-hue-light-select-id]").each(function () {
            if ($(this).attr('data-checked') == 1) {
                numSelected++;
            }
        });

        if (numSelected == 0) {
            $('#selectHueLights').attr('data-selected', 'false').html(Utils.getLangString('ui7_selectAll', 'Select All'));
        } else if (numSelected == numTotal) {
            $('#selectHueLights').attr('data-selected', 'true').html(Utils.getLangString('ui7_deselectAll', 'Deselect All'));
        }
    }

    function addBehaviorToCreateHueSceneBtn() {
        try {
            $("#hueLightsContainer").find("[data-hue-light-select-id]").each(function () {
                $(this).off().on('click', function () {
                    var lightId = $(this).data("hue-light-select-id");
                    var lightDeviceId = $(this).data("light-device-userdata-id");
                    var lightChecked = $(this).attr("data-checked");
                    addLightToHueScene(lightId, lightChecked, lightDeviceId);

                    checkSelectAllButton();
                });
                $("#saveHueScene").off().on('click', function () {
                    handleClickOnSceneNextStep();
                });
                $("#philips_hue_2_button_cancel_scene_edit").off('click').on('click', function (e) {
                    e.stopPropagation();
                    api.showCustomPopup(Utils.getLangString('ui7_philips_hue_confirm_cancel_scene_creation', 'Are you sure you want to cancel scene creation ?'), {
                        category: 'confirm',
                        onSuccess: function () {
                            var proceed = false;
                            if (editedSceneObj == null || typeof editedSceneObj === 'undefined') {
                                sceneList(deviceId);
                            } else if (typeof hueSceneObj !== 'undefined' && hueSceneObj != null && typeof hueSceneObj['name'] !== 'undefined' && editedSceneObj['name'] != hueSceneObj['name']) {
                                api.luReload(function() {
                                    sceneList(deviceId);
                                });
                            } else {
                                sceneList(deviceId);
                            }
                        }
                    });
                });
                $("#selectHueLights").off('click').on('click', function (e) {
                    e.stopPropagation();
                    if ($(this).attr('data-selected') == 'true') {
                        deselectAllSceneLights();
                        $(this).attr('data-selected', 'false');
                        $(this).html(Utils.getLangString("ui7_selectAll", "Select All"));
                    } else {
                        selectAllSceneLights();
                        $(this).attr('data-selected', 'true');
                        $(this).html(Utils.getLangString("ui7_deselectAll", "Deselect All"));
                    }

                });
            });
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.addBehaviorToCreateHueSceneBtn(): ' + err);
        }
    }

    function deselectAllSceneLights() {
        try {
            $("#hueLightsContainer").find("[data-hue-light-select-id]").each(function () {
                var lightId = $(this).attr("data-hue-light-select-id");
                var lightDeviceId = $(this).attr("data-light-device-userdata-id");
                addLightToHueScene(lightId, 1, lightDeviceId);
            });
        } catch (e) {
            Utils.logError('PhilipsHue.deselectAllSceneLights(): ' + e);
        }
    }

    function selectAllSceneLights() {
        try {
            $("#hueLightsContainer").find("[data-hue-light-select-id]").each(function () {
                var lightId = $(this).attr("data-hue-light-select-id");
                var lightDeviceId = $(this).attr("data-light-device-userdata-id");
                addLightToHueScene(lightId, 0, lightDeviceId);
            });
        } catch (e) {
            Utils.logError('PhilipsHue.selectAllSceneLights(): ' + e);
        }
    }

    function addLightToHueScene(lightId, lightChecked, lightDeviceId) {
        try {
            if (Utils.int(lightChecked) === 0) {
                $('[data-hue-light-select-id="' + lightId + '"]').addClass('checked');
                $('[data-hue-light-select-id="' + lightId + '"]').attr('data-checked', "1");
                if (!Utils.inArray(String(lightId), selectedHueLights)) {
                    selectedHueLights.push(String(lightId));
                }
                if (!Utils.inArray(String(lightDeviceId), selectedHueDeviceLights)) {
                    selectedHueDeviceLights.push(String(lightDeviceId));
                }
            } else {
                $('[data-hue-light-select-id="' + lightId + '"]').removeClass('checked');
                $('[data-hue-light-select-id="' + lightId + '"]').attr('data-checked', "0");
                removeElemFromArray(String(lightId), selectedHueLights);
                removeElemFromArray(String(lightDeviceId), selectedHueDeviceLights);
            }
            console.log("selectedHueLights", selectedHueLights);
            console.log("selectedHueDeviceLights", selectedHueDeviceLights);
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.addLightToHueScene(): ' + err);
        }
    }

    function handleClickOnSceneNextStep() {
        try {
            hueSceneObj = getHueSceneFromDOM();

            bridgeSceneList = getHueSceneList(deviceId, {
                sortByName: true
            });

            var nameFound = false;
            for(var i = 0; i < bridgeSceneList.length; i++){
                if(bridgeSceneList[i]['name'] ===  hueSceneObj.name && (!editedSceneObj || (editedSceneObj && editedSceneObj['id'] != bridgeSceneList[i]['id'] && hueSceneObj['name'] != editedSceneObj['name']))){
                    nameFound = true;
                    break;
                }
            }

            if(nameFound){
                myInterface.showMessagePopup(Utils.getLangString("ui7_hue_scene_name_found", "Scene name already used. Please choose another."), MessageCategory.NOTIFICATION);
                return;
            }

            if (!hueSceneObj.name) {
                myInterface.showMessagePopup(Utils.getLangString("ui7_hueSceneEmpty", "You must choose a name for your scene"), MessageCategory.NOTIFICATION);
                return;
            }

            if (!/^[^~!@#\$\%\^&\*\(\)\?\+=\{\[\}\]:;"|\\<,>.\/]+$/.test(Utils.trim(hueSceneObj.name))) {
                myInterface.showMessagePopup(Utils.getLangString("ui7_invalidHueSceneName", "Scene name should contain only numbers, letters and space."), MessageCategory.NOTIFICATION);
                return false;
            }
            if (Utils.trim(hueSceneObj.name).length > 16) {
                myInterface.showMessagePopup(Utils.getLangString("ui7_invalidHueSceneNameLength", "Scene name can have maximum 16 characters."), MessageCategory.NOTIFICATION);
                return false;
            }
            if (selectedHueLights.length === 0) {
                myInterface.showMessagePopup(Utils.getLangString("ui7_noHueLightSelected", "You must select at least one light"), MessageCategory.NOTIFICATION);
                return;
            }

            bridgeLightIdToUserDataLightId = mapBridgeLightIdToUserDataId();

            if (editedSceneObj) {
                hueSceneObj.id = editedSceneObj.id;
                if (editedSceneObj['version'] < 2) {
                    var msg = Utils.getLabel(MyConfig.LABEL_POLLING_HUE_BRIDGE);
                    api.showCustomPopup(msg, {
                        autoHide: WAIT_AFTER_RUN_HUE_SCENE
                    });
                    api.showLoadingOverlay().then(function () {
                        runHueScene(hueSceneObj.id, {
                            onSuccess: function () {
                                Q.delay(WAIT_AFTER_RUN_HUE_SCENE * 1000).then(function () {
                                    pollHueBridge({
                                        onSuccess: function () {
                                            Q.delay(WAIT_AFTER_POLL_HUE_BRIDGE * 1000).then(function () {
                                                addColorPicker();
                                                api.hideLoadingOverlay();
                                            });
                                        },
                                        onFailure: function () {
                                            api.hideLoadingOverlay();
                                        }
                                    });
                                });
                            },
                            onFailure: function () {
                                console.log('error running scene ' + hueSceneObj.id);
                                api.hideLoadingOverlay();
                            }
                        });
                    });
                } else {
                    console.log('hue scene version >= 2...');
                    var txtLightList = selectedHueLights.join(',');

                    api.showLoadingOverlay().then(function () {
                        var oldLightsSorted = editedSceneObj['lights'].sort();
                        var newLightsSorted = selectedHueLights.sort();
                        var nameChanged = editedSceneObj.name != hueSceneObj.name;
                        var lightListChanged = JSON.stringify(oldLightsSorted) != JSON.stringify(newLightsSorted);
                        if (nameChanged || lightListChanged) {
                            console.log('name or light list has changed...');
                            performModifyHueSceneNameAndLights(editedSceneObj.id, hueSceneObj.name, txtLightList, {
                                onSuccess: function(data) {
                                    var responseText = data['responseText'];
                                    if (typeof responseText !== 'undefined') {
                                        var jobId = Utils.getUpnpOutput(responseText, 'JobID');
                                        if (!isNaN(jobId) && jobId.length > 0) {
                                            handleGetHueSceneFlow(editedSceneObj.id);
                                        } else {
                                            api.hideLoadingOverlay();
                                            api.showCustomPopup(data['responseText']);
                                        }
                                    } else {
                                        api.hideLoadingOverlay();
                                        api.showCustomPopup(data['responseText']);
                                    }
                                },
                                onFailure: function(data) {
                                    api.hideLoadingOverlay();
                                }
                            });
                        } else {
                            handleGetHueSceneFlow(editedSceneObj.id);
                        }
                    });
                }
            } else {
                addColorPicker();
            }
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.handleClickOnSceneNextStep(): ' + err);
        }
    }

    function handleGetHueSceneFlow(sceneId) {
        performGetHueScene(sceneId, {
            onSuccess: function (data) {
                var responseText = data['responseText'];
                if (typeof responseText !== 'undefined') {
                    var jobId = Utils.getUpnpOutput(responseText, 'JobID');
                    if (!isNaN(jobId) && jobId.length > 0) {
                        console.log('job Id: ' + jobId);
                        setTimeout(function () {
                            console.log('now, read content of "GetSceneValues"...');
                            readContentOfGetSceneValues();
                        }, WAIT_BEFORE_PERFORMING_GET_SCENE_VALUES * 1000);
                    } else {
                        console.log(data);
                        api.hideLoadingOverlay();
                        api.showCustomPopup(data['responseText']);
                    }
                } else {
                    console.log(data);
                    api.hideLoadingOverlay();
                }
            },
            onFailure: function () {
                api.hideLoadingOverlay();
            }
        });
    }

    function performModifyHueSceneNameAndLights(id, name, lights, opt) {
        try {
            console.log('performing "ModifyHueSceneNameLights" for ' + id + ' ...');

            api.performLuActionOnDevice(deviceId, SID, 'ModifyHueSceneNameLights', {
                onSuccess: opt['onSuccess'],
                onFailure: opt['onFailure'],
                actionArguments: {
                    'Scene': id,
                    'Name': name,
                    'Lights': lights
                }
            });

        } catch (e) {
            Utils.logError('PhilipsHue2.performModifyHueSceneNameAndLights(): ' + e);
        }
    }

    function performGetHueScene(id, opt) {
        try {
            console.log('performing "GetHueScene" for ' + id + ' ...');

            api.performLuActionOnDevice(deviceId, SID, 'GetHueScene', {
                onSuccess: opt['onSuccess'],
                onFailure: opt['onFailure'],
                actionArguments: {
                    'Scene': id
                }
            });

        } catch (e) {
            Utils.logError('PhilipsHue2.performGetHueScene(): ' + e);
        }
    }

    function runHueScene(id, opt) {
        try {
            console.log('running scene ' + id + ' ...');

            api.performLuActionOnDevice(deviceId, SID, 'RunHueScene', {
                onSuccess: opt['onSuccess'],
                onFailure: opt['onFailure'],
                actionArguments: {
                    'Scene': id
                }
            });

        } catch (e) {
            Utils.logError('PhilipsHue2.runHueScene(): ' + e);
        }
    }

    function pollHueBridge(opt) {
        try {
            console.log('polling hue bridge...');

            api.performLuActionOnDevice(deviceId, SID, 'PollHueBridge', {
                onSuccess: opt['onSuccess'],
                onFailure: opt['onFailure'],
                actionArguments: {
                    'RunOnce': 'true'
                }
            });

        } catch (e) {
            Utils.logError('PhilipsHue2.pollHueBridge(): ' + e);
        }
    }

    function addColorPicker() {
        try {
            color_picker();
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.addColorPicker(): ' + err);
        }
    }

    function getHueSceneFromDOM() {
        try {
            var hueSceneObj = {};
            hueSceneObj.name = $.trim($("#newHueSceneName").val());
            hueSceneObj.lights = selectedHueLights.join();
            //hueSceneObj.room = $("#device_cpanel_room_device_select").val();
            hueSceneObj.id = Date.now();
            return hueSceneObj;
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.getHueSceneFromDOM(): ' + err);
        }
    }
    function mapBridgeLightIdToUserDataId() {
        try {
            var bridgeLightMap = {};
            for (var i = 0; i < selectedHueLights.length; i++) {
                bridgeLightMap[selectedHueLights[i]] = selectedHueDeviceLights[i];
            }
            return bridgeLightMap;
        } catch (err) {

        }
    }
    function removeElemFromArray(elemId, array) {
        try {
            for (var k = 0; k < array.length; k++) {
                if (array[k] == elemId) {
                    array.splice(k, 1);
                    k--;
                }
            }
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.removeElemFromArray(): ' + err);
        }
    }

////==============colorpicker=====================
    var SID = 'urn:micasaverde-com:serviceId:PhilipsHue1';
    var ACTION_SET_COLOR_TEMP = 'SetColorTemperature';
    var ACTION_SET_HUE_AND_SATURATION = 'SetHueAndSaturation';
    var VARIABLE_LAMP_VALUES = 'LampValues';
    var VARIABLE_LAMP_EFFECT_VALUE = 'LampEffectValue';
    var ACTION_SAVE_PRESET_COLOR = 'SavePresetColor';
    var VARIABLE_COLOR = 'Color';

    var MyConfig = {
        CANVAS_HOLDER: 'philips_hue_lamp_2_canvas_holder',
        CANVAS_COLOR_TEMP: {
            ID: 'philips_hue_lamp_2_canvas_color_temp',
            WIDTH: 500,
            HEIGHT: 40,
            TOP: 0,
            LEFT: 0
        },
        CANVAS_HUE_SAT: {
            ID: 'philips_hue_lamp_2_canvas_hue_sat',
            WIDTH: 500,
            HEIGHT: 320,
            TOP: 45,
            LEFT: 0
        },
        CANVAS_MARKER: {
            ID: 'philips_hue_lamp_2_canvas_marker',
            WIDTH: 20,
            HEIGHT: 20
        },
        LIGHTNESS_VALUE: {
            ID: 'philips_hue_2_lightness_value'
        },
        LIGHTNESS_SLIDER: {
            ID: 'philips_hue_2_lightness_slider'
        },
        CONTAINER_LIGHT_GROUPS: 'philips_hue_2_container_light_groups',
        CONTAINER_SET: 'philips_hue_lamp_2_container_set',
        CONTAINER_SELECTED_VALUES: 'philips_hue_lamp_2_container_values',
        CONTAINER_SELECTED_COLOR_TEMPERATURE: 'philips_hue_lamp_2_container_value_color_temp',
        CONTAINER_SELECTED_HUE: 'philips_hue_lamp_2_container_value_hue',
        CONTAINER_SELECTED_SATURATION: 'philips_hue_lamp_2_container_value_saturation',
        CONTAINER_FEEDBACK: 'philips_hue_lamp_2_container_feedback',
        CONTAINER_BRIDGE_CONFIGURE: 'philips_hue_2_bridge_configure',
	   CONTAINER_HUE_INFO: 'philips_hue_info_page',
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
        LABEL_SCENE_RUN_SUCCESS: {
            lang_tag: 'philips_hue_lamp_2_scene_run_success',
            text: 'Scene was successfully ran'
        },
        LABEL_SET_A_COLOR_PRESET: {
            lang_tag: 'philips_hue_lamp_2_set_a_color_preset',
            text: 'Set a color preset'
        },
        LABEL_MIN_API_VERSION: {
            lang_tag: 'philips_hue_lamp_2_min_api_version',
            text: 'WARNING ! You are using API version _API_VERSION_. Minimum API version required is _MINIMUM_REQUIRED_API_VERSION_ ! Some things may not work as expected.'
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
        LABEL_TRANSITION_TIME: {
            lang_tag: 'philips_hue_lamp_2_transition_time',
            text: 'Transition time'
        },
        LABEL_RECYCLE: {
            lang_tag: 'philips_hue_lamp_2_recycle',
            text: 'Recycle'
        },
        LABEL_FALSE: {
            lang_tag: 'philips_hue_lamp_2_false',
            text: 'false'
        },
        LABEL_TRUE: {
            lang_tag: 'philips_hue_lamp_2_true',
            text: 'true'
        },
        LABEL_SCENE_SAVED: {
            lang_tag: 'philips_hue_lamp_2_scene_saved',
            text: 'The Scene was saved.'
        },
        LABEL_SCENE_COULD_NOT_BE_SAVED: {
            lang_tag: 'philips_hue_lamp_2_scene_could_not_be_saved',
            text: 'Error ! The scene could not be saved !'
        },
        LABEL_INVALID_SCENE_TRANSITION_TIME: {
            lang_tag: 'philips_hue_lamp_2_invalid_transition_time',
            text: 'Invalid transition time. Enter an integer between 1 and 100.'
        },
        LABEL_TOO_MANY_FAVORITES_ADDED: {
            lang_tag: 'philips_hue_lamp_2_too_many_favorites',
            text: 'Too many scenes added to favorites. Maximum allowed is 6.'
        },
        CONTAINER_SELECT_PRESET: 'philips_hue_lamp_2_container_select_preset',
        BUTTON_SET_PRESET_COLOR: 'philips_hue_lamp_2_button_set_preset_color',
        LABEL_SET_PRESET_COLOR: {
            lang_tag: 'philips_hue_lamp_2_set_preset_color',
            text: 'Set'
        },
        LABEL_BRIDGE_PAIRING_IN_PROCESS: {
            lang_tag: 'philips_hue_2_bridge_pairing_in_process',
            text: 'Bridge pairing in process. Please wait...'
        },
        LABEL_CHOOSE_LIGHTS_FOR_COLOR: {
            lang_tag: 'philips_hue_2_choose_lights_for_color',
            text: 'For which lights do you want to apply the picked color ?'
        },
        LABEL_ADJUST_LIGHTNESS_FOR_LIGHTS: {
            lang_tag: 'philips_hue_2_choose_lightness_for_lights',
            text: 'And adjust the lightness for the lights...'
        },
        LABEL_SET_EFFECT: {
            lang_tag: 'philips_hue_2_set_an_effect',
            text: 'Set an effect...'
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
        LABEL_CHOOSE_AT_LEAST_ONE_LIGHT: {
            lang_tag: 'philips_hue_2_choose_at_least_one_light',
            text: 'Choose at least one light !'
        },
        LABEL_NO_MORE_LIGHTS_TO_CHOOSE_FROM: {
            lang_tag: 'philips_hue_2_no_more_lights_to_choose_from',
            text: 'There are no more lights to choose from. You can edit existing light groups.'
        },
        LABEL_LIGHTS: {
            lang_tag: 'philips_hue_2_lights',
            text: 'Lights'
        },
        LABEL_REMOVE: {
            lang_tag: 'philips_hue_2_remove',
            text: 'Remove'
        },
        LABEL_CONFIRM_LIGHT_GROUP_REMOVAL: {
            lang_tag: 'philips_hue_2_confirm_light_group_removal',
            text: 'Are you sure you want to remove this light group ?'
        },
        LABEL_POLLING_HUE_BRIDGE: {
            lang_tag: 'philips_hue_2_polling_hue_bridge',
            text: 'Polling Hue Bridge. This may take up to 1 minute. Please wait...'
        },
        LABEL_NO_LIGHTS_CONNECTED: {
            lang_tag: 'philips_hue_2_no_lights_connected',
            text: 'There are no lights connected to this bridge.'
        },
        LABEL_DELETE_SCENE: {
            lang_tag: 'philips_hue_2_delete_scene',
            text: 'Delete scene'
        },
        LABEL_SCENE_DELETED_WAIT: {
            lang_tag: 'philips_hue_2_scene_deleted_wait',
            text: 'The scene was deleted. Wait for it to disappear from the list.'
        },
        LABEL_SCENE_CREATED_WAIT: {
            lang_tag: 'philips_hue_2_scene_created_wait',
            text: 'The scene was created. Wait for it to appear in the list.'
        },
	   LABEL_SCENE_CREATED_DONE: {
            lang_tag: 'philips_hue_2_scene_created_done',
            text: 'The scene is ready for use.'
        },
        LABEL_BRIDGE_FW_VERSION: {
            lang_tag: 'ui7_philipsHue_bridgeInfo_section_bridgeFWversion',
            text: 'Bridge Firmware Version'
        }
    };

    var pickedValues = {
        colorTemperature: -1,
        hue: -1,
        saturation: -1
    };

    function returnHTMLContainer() {
        var labelButtonSetValues = Utils.getLabel(MyConfig.LABEL_BUTTON_SET_LAMP);
        var labelSetPresetColor = Utils.getLabel(MyConfig.LABEL_SET_PRESET_COLOR);
        var labelColorTemperature = Utils.getLabel(MyConfig.LABEL_COLOR_TEMPERATURE);
        var labelHue = Utils.getLabel(MyConfig.LABEL_HUE);
        var labelSaturation = Utils.getLabel(MyConfig.LABEL_SATURATION);
        var labelOr = Utils.getLabel(MyConfig.LABEL_OR);
        var labelSetAColorPreset = Utils.getLabel(MyConfig.LABEL_SET_A_COLOR_PRESET);

        var html = '<div class="hueBridgeColorPickerContainer" id="philips_hue_2_scene_step_2_container_' + deviceId + '">' +
            '<div class="newSceneName">' +
            '<div style="float: left;">' +
            hueSceneObj.name +
            '</div>' +
            '<div style="float: right;">' +
            '       <div class="scenes_button_cancel" id="philips_hue_2_button_back_from_color_picker">' + Utils.getLangString("ui7_general_ucase_back", "Back") + '</div>' +
            '</div>' +
            '<div style="clear: both;"></div>' +
            '</div>' +
                '<div id="philips_hue_2_scene_options_container" class="clearfix">' +
                '   <div class="clearfix" style="border-bottom: dotted 1px #000000; line-height: 60px;">' +
                '       <div class="float_left">'+Utils.getLabel(MyConfig.LABEL_TRANSITION_TIME)+':</div>' +
                '       <div class="float_left margin_left_10">' +
                '           <input class="device_cpanel_input_text" style="width: 60px; text-align: right;" type="text" id="philips_hue_2_scene_option_transition_time" value="50" />' +
                '       </div>' +
                '       <div class="clearfix"></div>' +
                '   </div>' +
                '   <div class="clearfix hidden" style="border-bottom: dotted 1px #000000; line-height: 60px;">' +
                '       <div class="float_left">'+Utils.getLabel(MyConfig.LABEL_RECYCLE)+':</div>' +
                '       <div class="float_left margin_left_10">' +
                '           <select id="philips_hue_2_scene_option_recycle">' +
                '               <option value="false">'+Utils.getLabel(MyConfig.LABEL_FALSE)+'</option>' +
                '               <option value="true">'+Utils.getLabel(MyConfig.LABEL_TRUE)+'</option>' +
                '           </select>' +
                '       </div>' +
                '       <div class="clearfix"></div>' +
                '   </div>' +
                '</div>' +
                //'<div class="luminositySliderContainer clearfix">'+
                //'   <div class="pull-left luminositySliderLabel">'+Utils.getLangString("ui7_lightness","Lightness")+'</div>'+
                //'   <div class="pull-left luminosityIntensity" id="luminosityIntensity"></div>'+
                //'   <div id="luminositySlider" class="luminositySlider pull-left"></div>'+
                //'</div>'+
            '<div style="clear: both; position: relative; margin-top: 15px;">' +
            '<div id="' + MyConfig.CANVAS_HOLDER + '" style="clear: both; z-index: 100;">' +
            '<div>' +
            '   <canvas id="' + MyConfig.CANVAS_COLOR_TEMP.ID + '" width="' + MyConfig.CANVAS_COLOR_TEMP.WIDTH + '" height="' + MyConfig.CANVAS_COLOR_TEMP.HEIGHT + '" style="cursor: crosshair; border: solid 1px #E9E9E9; border-radius: 3px;"></canvas>' +
            '</div>' +
            '<div>' +
            '   <canvas id="' + MyConfig.CANVAS_HUE_SAT.ID + '" width="' + MyConfig.CANVAS_HUE_SAT.WIDTH + '" height="' + MyConfig.CANVAS_HUE_SAT.HEIGHT + '" style="cursor: crosshair; border: solid 1px #E9E9E9; border-radius: 3px;"></canvas>' +
            '</div>' +
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
            '<div id="' + MyConfig.CONTAINER_LIGHT_GROUPS + '" style="clear: both; z-index: 100; margin-top: 10px; margin-bottom: 15px;"></div>' +
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

    function hueSceneAddLightToCheckedList(lightId) {
        try {
            if (typeof hueSceneObj['currentGroup'] === 'undefined') {
                hueSceneObj['currentGroup'] = {
                    lights: []
                };
            }

            var found = false;
            for (var i = 0; i < hueSceneObj['currentGroup']['lights'].length && !found; i++) {
                if (hueSceneObj['currentGroup']['lights'][i] == lightId) {
                    found = true;
                }
            }

            if (!found) {
                hueSceneObj['currentGroup']['lights'].push(lightId);
            }
        } catch (e) {
            Utils.logError('Error in PhilipsHue2.hueSceneAddLightToCheckedList(): ' + e);
        }
    }

    function hueSceneRemoveLightFromCheckedList(lightId) {
        try {
            if (typeof hueSceneObj['currentGroup'] !== 'undefined' && typeof hueSceneObj['currentGroup']['lights'] !== 'undefined') {
                for (var i = 0; i < hueSceneObj['currentGroup']['lights'].length; i++) {
                    if (hueSceneObj['currentGroup']['lights'][i] == lightId) {
                        hueSceneObj['currentGroup']['lights'].splice(i, 1);
                        i--;
                    }
                }
            }
        } catch (e) {
            Utils.logError('Error in PhilipsHue2.hueSceneRemoveLightFromCheckedList(): ' + e);
        }
    }

    function generateLightGroupId(group) {
        try {
            if (typeof group['lights'] !== 'undefined') {
                var list = Utils.cloneObject(group['lights']);

                var swapped;
                var n = list.length;
                do {
                    swapped = false;
                    for (var i = 0; i < n - 1; i++) {
                        if (list[i] > list[i + 1]) {
                            var aux = list[i];
                            list[i] = list[i + 1];
                            list[i + 1] = aux;
                            swapped = true;
                        }
                    }
                    n = n - 1;
                } while (swapped);

                return list.join(',');
            }
        } catch (e) {
            Utils.logError('Error in PhilipsHue2.generateLightGroupId(): ' + e);
        }

        return 0;
    }

    function handleColorPicked() {
        createListOfAvailableLightsForHueScene();

        if (hueSceneObj['currentGroup']['lights'].length > 0) {
            api.showCustomPopup(returnSceneListAvailableLights(), {
                afterShow: function () {
                    // create the slider...
                    $('#' + MyConfig.LIGHTNESS_SLIDER.ID).slider({
                        range: "min",
                        min: 0,
                        max: 100,
                        value: 50,
                        change: function (event, ui) {
                            var intensityValue = ui.value + ' %';
                            $('#' + MyConfig.LIGHTNESS_VALUE.ID).html(intensityValue);
                        },
                        slide: function (event, ui) {
                            var intensityValue = ui.value + ' %';
                            $('#' + MyConfig.LIGHTNESS_VALUE.ID).html(intensityValue);
                        },
                        stop: function (event, ui) {
                            //saveHueLightness(ui.value);
                        }
                    });
                    var sliderValue = $('#' + MyConfig.LIGHTNESS_SLIDER.ID).slider("option", "value");
                    var intensityValue = sliderValue + ' %';
                    $('#' + MyConfig.LIGHTNESS_VALUE.ID).html(intensityValue);

                    $('#hue_scene_list_available_lights_' + deviceId).find('[data-container="available_lights"]').off('click').on('click', function (e) {
                        e.stopPropagation();
                        var $lightRow = $(e.target);
                        if ($lightRow.length > 0) {
                            var lightId;
                            if (typeof $lightRow.attr('data-available_light') !== 'undefined') {
                                lightId = $lightRow.attr('data-available_light');
                            } else {
                                $lightRow = $lightRow.closest('[data-available_light]');
                                if ($lightRow.length == 1) {
                                    lightId = $lightRow.attr('data-available_light');
                                }
                            }

                            if (typeof lightId !== 'undefined') {
                                if ($lightRow.attr('data-checked') == 1) {
                                    $lightRow.attr('data-checked', 0);
                                    $lightRow.find('[data-container="checkbox"]').removeClass('checked');
                                    hueSceneRemoveLightFromCheckedList(lightId);
                                } else {
                                    $lightRow.attr('data-checked', 1);
                                    $lightRow.find('[data-container="checkbox"]').addClass('checked');
                                    hueSceneAddLightToCheckedList(lightId);
                                }
                            }
                        }
                    });
                },
                onSuccess: function () {
                    if (hueSceneObj['currentGroup']['lights'].length > 0) {
                        var g = {
                            id: 0,
                            pickedValues: Utils.cloneObject(pickedValues),
                            lightness: $('#' + MyConfig.LIGHTNESS_SLIDER.ID).slider('option', 'value'),
                            lights: hueSceneObj['currentGroup']['lights'],
                            effect: $('#philips_hue_2_effect').val()
                        };
                        g['id'] = generateLightGroupId(g);
                        if (typeof hueSceneObj['groups'] === 'undefined') {
                            hueSceneObj['groups'] = [];
                        }
                        hueSceneObj['groups'].push(g);

                        // and update light groups...
                        hueSceneUpdateLigthGroups();
                    } else {
                        var msg = Utils.getLabel(MyConfig.LABEL_CHOOSE_AT_LEAST_ONE_LIGHT);
                        api.showCustomPopup(msg, {
                            afterHide: function () {
                                handleColorPicked();
                            }
                        });
                    }
                }
            });
        } else {
            api.showCustomPopup(Utils.getLabel(MyConfig.LABEL_NO_MORE_LIGHTS_TO_CHOOSE_FROM));
            hideMarker();
        }
    }

    function getHueBridgeLightById(id) {
        try {
            for (var i = 0; i < lightList.length; i++) {
                var c = lightList[i];
                if (c['id'] == id) {
                    return c;
                }
            }
        } catch (e) {
            Utils.logError('PhilipsHue2.getHueBridgeLightById():' + e);
        }

        return undefined;
    }

    function returnLightGroupView(group) {
        var hue = convertPhilpsHueToRegularHue(group['pickedValues']['hue']);
        var saturation = convertPhilpsSaturationToRegularSaturation(group['pickedValues']['saturation']);
        var lightness = group['lightness'];
        //var hslColor  = "hsl("+ hue + "," + saturation + "," + lightness + ")";
        var hslColor = "hsl(" + hue + "," + saturation + "," + 50 + ")";
        var color = tinycolor(hslColor);
        var rgbString = color.toRgbString();

        var labelLights = Utils.getLabel(MyConfig.LABEL_LIGHTS);
        var labelRemove = Utils.getLabel(MyConfig.LABEL_REMOVE);

        var htmlLightList = '', l = [];
        for (var i = 0; i < group['lights'].length; i++) {
            var currentLight = getHueBridgeLightById(group['lights'][i]);

            if (typeof currentLight !== 'undefined') {
                l.push('<abbr title="' + currentLight['name'] + '">' + Utils.cutStringAtLength(currentLight['name'], 20) + '</abbr>');
            }
        }
        htmlLightList = l.join(', ');

        var currentSceneVersion = (typeof editedSceneObj !== 'undefined' && editedSceneObj != null && typeof editedSceneObj['version'] !== 'undefined') ? editedSceneObj['version'] : 2;

        var html = '<div style="clear: both; margin-top: 5px; margin-bottom: 3px; width: 500px;">' +
            '<div style="float: left; width: 32px; height: 32px; background-color: ' + rgbString + '; border: solid 1px #000000; border-radius: 3px;">' +
            '   <div style="line-height: 32px; font-size: 10px; text-align: center;">' + lightness + '%</div>' +
            '   </div>';
        html += '<div style="float: left; width: 330px; margin-left: 10px; font-weight: bold; line-height: 32px;">' + htmlLightList + '</div>';
        html += '<div style="float: right;"><div style="width: 100px; background-color: #F4F4F4; border-radius: 10px; cursor: pointer;height: 30px;line-height: 30px;text-align: center;color: #000000;" data-container="button_remove" data-group_id="' + group['id'] + '">' + labelRemove + '</div></div>';
        html += '<div style="clear: both;"></div>';
        if (currentSceneVersion >= 2) {
            var displayedEffect = (typeof group['effect'] !== 'undefined') ? group['effect'] : Utils.getLabel(MyConfig.LABEL_EFFECT_NONE);
            html += '<div style="margin-left: 48px; display: none;">'+Utils.getLabel(MyConfig.LABEL_EFFECT)+': '+displayedEffect+'</div>';
        }
        html += '</div>';

        return html;
    }

    function handleClickOnRemoveLightGroup(group_id) {
        var msg = Utils.getLabel(MyConfig.LABEL_CONFIRM_LIGHT_GROUP_REMOVAL);
        api.showCustomPopup(msg, {
            category: 'confirm',
            onSuccess: function () {
                for (var i = 0; i < hueSceneObj['groups'].length; i++) {
                    if (hueSceneObj['groups'][i]['id'] == group_id) {
                        hueSceneObj['groups'].splice(i, 1);
                        i--;
                    }
                }

                hueSceneUpdateLigthGroups();
            }
        });
    }

    function hueSceneUpdateLigthGroups() {
        console.log(' >>>>>>> groups are: ' + JSON.stringify(hueSceneObj['groups']));
        var $container = $('#' + MyConfig.CONTAINER_LIGHT_GROUPS);
        $container.empty();
        for (var i = 0; i < hueSceneObj['groups'].length; i++) {
            var group = hueSceneObj['groups'][i];
            var $lightGroupRow = $(returnLightGroupView(group)).appendTo($container);
            $lightGroupRow.find('[data-container="button_remove"]').off('click').on('click', function (e) {
                e.stopPropagation();
                handleClickOnRemoveLightGroup($(this).attr('data-group_id'));
            });
        }
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
            updateValues(retVal);
            savePickedValues(retVal);
            showMarkerAtMousePosition(retVal, e.clientX, e.clientY);
            handleOnColorPick();
            setLuminositySliderColor(retVal);

            handleColorPicked();
        });

        $("#finishSaveHueScene").off().on("click", function () {
            if ($("#philips_hue_2_container_light_groups").children().length > 0) {
                if (areSceneOptionsValid()) {
                    saveHueSceneAndHueLightsColors();
                }
            } else {
                myInterface.showMessagePopup(Utils.getLangString("ui7_hueNoColorSelected", "You must choose a color for your light(s)"), MessageCategory.NOTIFICATION);
            }
        });

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
                saveHueLightness(ui.value);
            }
        });
        var sliderValue = $("#luminositySlider").slider("option", "value");
        var intensityValue = sliderValue + ' %';
        $("#luminosityIntensity").html(intensityValue);
    }

    function areSceneOptionsValid() {
        var enteredTransitionTime = $('#philips_hue_2_scene_option_transition_time').val();
        if (enteredTransitionTime.length < 1 || isNaN(parseInt(enteredTransitionTime, 10)) || parseInt(enteredTransitionTime, 10) < 1 || parseInt(enteredTransitionTime, 10) > 100) {
            var msg = Utils.getLabel(MyConfig.LABEL_INVALID_SCENE_TRANSITION_TIME);
            api.showCustomPopup(msg, {
                autoHide: 7,
                category: 'error'
            });
            return false;
        }

        // store scene options in the hueSceneObj...
        var selectedRecycleValue = $('#philips_hue_2_scene_option_recycle').val();
        hueSceneObj['recycle'] = selectedRecycleValue == 'true';
        hueSceneObj['transitiontime'] = parseInt(enteredTransitionTime, 10);

        return true;
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

        if (show) {
            //$('#' + MyConfig.CONTAINER_SET).show();
            $("#finishSaveHueScene").attr("disabled", false);
        }
    }

    function sendPickedValues(lightId, opt) {
        try {
            var p = (typeof opt !== 'undefined' && typeof opt['pickedValues'] !== 'undefined') ? opt['pickedValues'] : pickedValues;
            var effect = (typeof opt !== 'undefined' && typeof opt['effect'] !== 'undefined') ? opt['effect'] : 'none';

            if (p['colorTemperature'] > -1) {
                api.performLuActionOnDevice(lightId, SID, ACTION_SET_COLOR_TEMP, {
                    actionArguments: {
                        ColorTemperature: p['colorTemperature'],
                        Effect: effect
                    }
                });
            }
            if (p['hue'] > -1 && p['saturation'] > -1) {
                api.performLuActionOnDevice(lightId, SID, ACTION_SET_HUE_AND_SATURATION, {
                    actionArguments: {
                        Hue: p['hue'],
                        Saturation: p['saturation'],
                        Effect: effect
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

    function fillCanvases() {
        fillColorTempCanvas();

        fillHueSatCanvas();
    }

    function fillColorTempCanvas() {
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
            }
        } catch (e) {
            Utils.logError('Error in PhilipsHueLamp2.fillColorTempCanvas(): ' + e);
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

    function hideMarker() {
        $('#' + MyConfig.CANVAS_MARKER.ID).hide();
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

            var x = Math.floor(MyConfig.CANVAS_MARKER.WIDTH / 2);
            var y = Math.floor(MyConfig.CANVAS_MARKER.HEIGHT / 2);

            ctx.beginPath();
            ctx.moveTo(x, y + 10);
            ctx.lineTo(x, y - 10);
            ctx.moveTo(x - 10, y);
            ctx.lineTo(x + 10, y);
            ctx.stroke();
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

    function parsePickedValuesTextIntoObject(txt) {
        var pv = {
            colorTemperature: -1,
            hue: -1,
            saturation: -1
        };

        try {
            if (typeof txt !== 'undefined' && txt !== false) {
                var splits = txt.split(/[,;]+/), splits2;
                if (splits.length == 1) {
                    splits2 = splits[0].split(':');
                    if (typeof splits2[1] != 'undefined') {
                        if (splits2[0].toLowerCase() == 'ct') {
                            pv['colorTemperature'] = parseInt(splits2[1], 10);
                        }
                    }
                } else if (splits.length == 2) {
                    splits2 = splits[0].split(':');
                    if (splits2[0].toLowerCase() == 'hue') {
                        pv['hue'] = parseInt(splits2[1], 10);
                    }
                    if (splits2[0].toLowerCase() == 'sat') {
                        pv['saturation'] = parseInt(splits2[1], 10);
                    }

                    splits2 = splits[1].split(':');
                    if (splits2[0].toLowerCase() == 'hue') {
                        pv['hue'] = parseInt(splits2[1], 10);
                    }
                    if (splits2[0].toLowerCase() == 'sat') {
                        pv['saturation'] = parseInt(splits2[1], 10);
                    }
                }
            }
        } catch (e) {
            Utils.logError('PhilipsHue2.parsePickedValuesTextIntoObject(): ' + e);
        }

        return pv;
    }

    function getHueLampLightState(lightId) {
        try {
            if (typeof hueSceneValues !== 'undefined' && hueSceneValues !== null) {
                if (typeof hueSceneValues['lightstates'] !== 'undefined') {
                    return hueSceneValues['lightstates'][lightId];
                }
            }
        } catch (e) {
            Utils.logError('PhilipsHue2.getHueLampLightState(): ' + e);
        }
    }

    function getHueLampLightness(lightId) {
        try {
            var lightState = getHueLampLightState(lightId);
            if (typeof lightState !== 'undefined') {
                console.log(' ********************************* for ' + lightId + ': ', lightState);
                var obj = {
                    on: lightState['on'],
                    bri: lightState['bri']
                };

                return fromHueBrightness(obj);
            }
        } catch (e) {
            Utils.logError('PhilipsHue2.getHueLampLightness(): ' + e);
        }

        return 50;
    }

    function getHueLampValues(lightId) {
        var txt = '';

        try {
            var arr = [];
            var lightState = getHueLampLightState(lightId);
            if (typeof lightState !== 'undefined') {
                if (typeof lightState['hue'] !== 'undefined') {
                    arr.push('hue:' + lightState['hue']);
                }
                if (typeof lightState['sat'] !== 'undefined') {
                    arr.push('sat:' + lightState['sat']);
                }
                if (typeof lightState['ct'] !== 'undefined') {
                    arr.push('ct:' + lightState['ct']);
                }
            }
            txt = arr.join(',');
        } catch (e) {
            Utils.logError('PhilipsHue2.getHueLampValues(): ' + e);
        }

        return txt;
    }

    function readCurrentVariableState() {
        try {
            console.log('reading current lamp values...');
            var txt = "";
            if (editedSceneObj) {
                hueSceneObj['groups'] = [];

                for (var tt = 0; tt < selectedHueLights.length; tt++) {
                    var currentLightId = selectedHueLights[tt], g, txtLightness, lightness = 50, txtEffect = 'none';

                    if (editedSceneObj.version < 2) {
                        txtLightness = api.getDeviceState(bridgeLightIdToUserDataLightId[currentLightId], SID_DIMMING, VARIABLE_LOAD_LEVEL);
                    } else {
                        txtLightness = getHueLampLightness(currentLightId);
                    }
                    if (typeof txtLightness !== 'undefined' && txtLightness !== false) {
                        lightness = parseInt(txtLightness, 10);
                    }

                    if (editedSceneObj.version < 2) {
                        txt = api.getDeviceState(bridgeLightIdToUserDataLightId[currentLightId], SID, VARIABLE_LAMP_VALUES);
                    } else {
                        txt = getHueLampValues(currentLightId);
                    }

                    if (editedSceneObj.version >= 2) {
                        var tmpEffect = api.getDeviceState(bridgeLightIdToUserDataLightId[currentLightId], SID, VARIABLE_LAMP_EFFECT_VALUE);
                        if (typeof tmpEffect !== 'undefined' && tmpEffect != false) {
                            txtEffect = tmpEffect;
                        }
                    }

                    var pv = parsePickedValuesTextIntoObject(txt);
                    //console.log(currentLightId + ' |' + txt + '| ' + JSON.stringify(pv));
                    var groupFound = false;
                    for (var ig = 0; ig < hueSceneObj['groups'].length && !groupFound; ig++) {
                        g = hueSceneObj['groups'][ig];
                        if (JSON.stringify(g['pickedValues']) == JSON.stringify(pv)) {
                            hueSceneObj['groups'][ig]['lights'].push(currentLightId);
                            hueSceneObj['groups'][ig]['lightness'] = lightness;
                            groupFound = true;
                        }
                    }

                    if (!groupFound) {
                        g = {
                            id: 0,
                            pickedValues: Utils.cloneObject(pv),
                            lightness: lightness,
                            lights: [currentLightId],
                            effect: txtEffect
                        };
                        g['id'] = generateLightGroupId(g);
                        hueSceneObj['groups'].push(g);
                    }
                }
            } else {
                txt = api.getDeviceState(api.getCpanelDeviceId(), SID, VARIABLE_LAMP_VALUES);

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
            }

            if (!editedSceneObj) {
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
            }
        } catch (e) {
            Utils.logError('Error in PhilipsHue2.readCurrentVariableState(): ' + e);
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

    function getValueForTransitionTime() {
        if (typeof hueSceneValues !== 'undefined' && hueSceneValues != null && typeof hueSceneValues['lightstates'] !== 'undefined') {
            for (var state in hueSceneValues['lightstates']) {
                if (hueSceneValues['lightstates'].hasOwnProperty(state) && typeof hueSceneValues['lightstates'][state]['transitiontime'] !== 'undefined') {
                    return hueSceneValues['lightstates'][state]['transitiontime'];
                }
            }
        }

        return 50;
    }

    function color_picker() {
        try {
            // initialize values...
            pickedValues = {
                colorTemperature: -1,
                hue: -1,
                saturation: -1
            };

            // get the view...
            api.setCpanelContent(returnHTMLContainer());

            // fill the canvas...
            fillCanvases();

            // attach event handlers...
            attachCanvasEventHandlers();

            // handler for 'set lamp values'...
            $('#' + MyConfig.BUTTON_SET_VALUES).off('click').on('click', function (e) {
                e.stopPropagation();
                //sendPickedValues();
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

            // handler for 'back' button...
            $('#philips_hue_2_button_back_from_color_picker').off('click').on('click', function (e) {
                e.stopPropagation();
                createHueScene("calledFromColorPicker");
            });

            // draw canvas for marker...
            drawCanvasForMarker();

            if (editedSceneObj) {
                if (editedSceneObj.version < 2) {
                    $('#philips_hue_2_scene_options_container').addClass('hidden');
                } else {
                    console.log('scene values: ' + JSON.stringify(hueSceneValues));
                    var valueForRecycle = (typeof hueSceneValues['recycle'] !== 'undefined' && hueSceneValues['recycle']) ? 'true' : 'false';
                    // search for the value of transition time...
                    var valForTransitionTime = getValueForTransitionTime();
                    $('#philips_hue_2_scene_option_recycle').val(valueForRecycle);
                    $('#philips_hue_2_scene_option_transition_time').val(valForTransitionTime);
                }

                readCurrentVariableState();

                setLigthnessLevel();

                hueSceneUpdateLigthGroups();

                $("#finishSaveHueScene").attr("disabled", false);
            }
        } catch (e) {
            Utils.logError('Error in PhilipsHueLamp2.color_picker(): ' + e);
        }
    }

    function saveHueSceneAndHueLightsColors() {
        try {
            delete hueSceneObj['currentGroup'];
            api.showLoadingOverlay().then(function () {
                console.log('setting light values...');
                var numLights = 0;
                for (var i = 0; i < hueSceneObj['groups'].length; i++) {
                    var group = hueSceneObj['groups'][i];
                    for (var j = 0; j < group['lights'].length; j++) {
                        numLights++;
                        var lightDeviceId = 0;
                        (function (group, i, j) {
                            setTimeout(function () {
                                // first colors...
                                sendPickedValues(bridgeLightIdToUserDataLightId[group['lights'][j]], {
                                    pickedValues: group['pickedValues'],
                                    effect: group['effect']
                                });

                                // then lightness...
                                sendHueLightnessCommand(bridgeLightIdToUserDataLightId[group['lights'][j]], group['lightness']);
                            }, 1000 * j);
                        })(group, i, j);
                    }
                }

                setTimeout(function () {
                    console.log('lights were set => saving hue scene');
                    api.hideLoadingOverlay();

                    api.showLoadingOverlay();

                    console.log(' >>>>>>>>>>> ' + JSON.stringify(hueSceneObj));

                    if (editedSceneObj) {
                        hueSceneObj['version'] = editedSceneObj['version'];
                        modifyHueScene();
                        editedSceneObj = null;
                    } else {
                        sendCreateHueSceneCommand();
                    }
                }, numLights * 2 * 1000);
            }).fail(function(){
                console.log('error while saving scene...');
                api.hideLoadingOverlay();
            });
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.saveHueSceneAndHueLightsColors(): ' + err);
        }
    }

    function saveHueLightsColors() {
        try {
            var lightsIdList = hueSceneObj.lights.split(",");
            console.log("lightsIdList", lightsIdList);
            console.log("bridgeLightIdToUserDataLightId", bridgeLightIdToUserDataLightId);
            for (var i = 0; i < lightsIdList.length; i++) {
                (function (i) {
                    setTimeout(function () {
                        console.log(lightsIdList[i]);
                        sendPickedValues(bridgeLightIdToUserDataLightId[lightsIdList[i]]);
                    }, 1000 * i);
                })(i);
            }
        } catch (err) {

        }
    }

	function sendDeleteHueSceneCommand(sceneId) {
        try {
			savedSceneId = hueSceneObj.id;
			var deviceId = api.getCpanelDeviceId();
            myInterface.showStartupModalLoading();
			deletedScene = sceneId;
            api.performLuActionOnDevice(api.getCpanelDeviceId(), HUE_SID, "DeleteHueScene", {
                actionArguments: {
                    Scene: sceneId
                },
                onSuccess: function () {
                    application.addEvent('on_startup_luStatusLoaded', PhilipsHue2, 'reloadSceneListAfterDelete');
                },
                onFailure: function () {
                    myInterface.hideModalLoading(true);
                }
            });
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.sendCreateHueSceneCommand(): ' + err);
        }
    }

    function sendCreateHueSceneCommand() {
        try {
            savedSceneId = hueSceneObj.id;
            api.performLuActionOnDevice(api.getCpanelDeviceId(), "urn:micasaverde-com:serviceId:PhilipsHue1", "CreateHueScene", {
                actionArguments: {
                    Scene: hueSceneObj.id,
                    Name: hueSceneObj.name,
                    Lights: hueSceneObj.lights,
					Transitiontime: hueSceneObj['transitiontime'],
					Recycle: hueSceneObj['recycle']
                },
                onSuccess: function () {
                    api.hideLoadingOverlay();
                    application.addEvent('on_startup_luStatusLoaded', PhilipsHue2, 'reloadSceneList');
                    handleSuccessForSceneChange(Utils.getLabel(MyConfig.LABEL_SCENE_CREATED_WAIT));
                },
                onFailure: function () {
                    console.log('ERROR when creating new scene !');
                    api.hideLoadingOverlay();
                }
            });
        } catch (err) {
            Utils.logError('Error in PhilipsHue2.sendCreateHueSceneCommand(): ' + err);
        }
    }
	function reloadSceneListAfterDelete() {
		var deviceId = api.getCpanelDeviceId();
        var sceneList = api.getDeviceState(deviceId, HUE_SID, "BridgeScenes", {dynamic: true});
            myInterface.hideModalLoading(true);
            application.removeEvent("on_startup_luStatusLoaded", PhilipsHue2, 'reloadSceneListAfterDelete');
			application.addEvent('on_ui_userDataLoaded', PhilipsHue2, 'redrawHueScenesViewAfterDelete');
			myInterface.showStartupModalLoading();
            handleSuccessForSceneChange(Utils.getLabel(MyConfig.LABEL_SCENE_DELETED_WAIT));
    }

    function redrawHueScenesViewAfterDelete() {
		var deviceId = api.getCpanelDeviceId();
		hueSceneObj = getHueSceneFromDOM();

		setTimeout(function(){
			bridgeSceneList = getHueSceneList(deviceId, {
				sortByName: true
			});
			var sceneListView = returnSceneListView(bridgeSceneList);
			api.setCpanelContent(sceneListView);

			myInterface.hideModalLoading(true);
			application.removeEvent("on_ui_userDataLoaded", PhilipsHue2, 'redrawHueScenesViewAfterDelete');
			var sceneId = deletedScene;
			deletedScene = false;
			//console.log("sceneId: ");
			//console.log(sceneId);

			var	bridgeFavoriteScenesValue = api.getDeviceState(deviceId, HUE_SID, "BridgeFavoriteScenes");
			if(typeof bridgeFavoriteScenesValue != 'undefined' && bridgeFavoriteScenesValue !== ""){
				bridgeFavoriteScenesValue = bridgeFavoriteScenesValue.split(",");
				var flagDeletedFavorite = false;
				for(var i=0;i<bridgeFavoriteScenesValue.length;i++){
					if(sceneId  == bridgeFavoriteScenesValue[i]){
						flagDeletedFavorite = true;
						bridgeFavoriteScenesValue.splice(i,1);
					}
				}
				var newbridgeFavoriteScenesValue = [];
				for(var i=0; i<bridgeFavoriteScenesValue.length;i++){
					newbridgeFavoriteScenesValue.push(bridgeFavoriteScenesValue[i]);
				}
				newbridgeFavoriteScenesValue = newbridgeFavoriteScenesValue.join(",");
				if(flagDeletedFavorite == true){
					Q.delay(WAIT_AFTER_CLICK_ON_FAVORITES * 1000).then(function () {
						api.setDeviceStatePersistent(deviceId, HUE_SID, "BridgeFavoriteScenes", newbridgeFavoriteScenesValue);
					});
				}
			}

		}, 5000);
	}

    function reloadSceneList() {
        var deviceId = api.getCpanelDeviceId();
        var sceneList = api.getDeviceState(deviceId, HUE_SID, "BridgeScenes", {dynamic: true});
        //if (sceneList.search(savedSceneId) !== -1) {
            myInterface.hideModalLoading(true);
            application.removeEvent("on_startup_luStatusLoaded", PhilipsHue2, 'reloadSceneList');
			//console.log("YYY");
			application.addEvent('on_ui_userDataLoaded', PhilipsHue2, 'redrawHueScenesViewAfterDelete');
			myInterface.showStartupModalLoading();
            savedSceneId = "";
            handleSuccessForSceneChange(Utils.getLabel(MyConfig.LABEL_SCENE_CREATED_DONE));
        //}
    }
    function handleSuccessForSceneChange(msg) {
        api.luReload();
        api.showCustomPopup(msg, {
            autoHide: 5,
            afterHide: function () {
                sceneList(deviceId);
                api.hideLoadingOverlay();
            }
        });
    }

    function handleFailureForSceneChange(opt_msg) {
        var msg = (typeof opt_msg !== 'undefined') ? opt_msg : Utils.getLabel(MyConfig.LABEL_SCENE_COULD_NOT_BE_SAVED);

        api.showCustomPopup(msg, {
            autoHide: 5,
            category: 'error'
        });
    }

    function toHueBrightness(lightness) {
        var obj = {
            on: false,
            bri: 0
        };

        if (lightness > 0) {
            obj['on'] = true;
            obj['bri'] = Math.floor(lightness * 254 / 100);
        }
        if (obj['bri'] == 0) {
            obj['on'] = false;
        }

        return obj;
    }

    function fromHueBrightness(obj) {
        var lightness = 0;

        if (typeof obj['on'] !== 'undefined' && obj['on'] && typeof obj['bri'] !== 'undefined' && obj['bri'] > 0) {
            lightness = Math.min(Math.ceil(obj['bri'] * 100 / 254), 100);
        }

        return lightness;
    }

    function modifyHueScene() {
        try {
            var lightsIdList = hueSceneObj.lights.split(",");

            var i, j, g;
            if (hueSceneObj['version'] < 2) {
                for (i = 0; i < hueSceneObj['groups'].length; i++) {
                    g = hueSceneObj['groups'][i];
                    for (j = 0; j < g['lights'].length; j++) {
                        (function (g, j) {
                            setTimeout(function () {
                                sendModifyHueSceneCommand(g['lights'][j], g['pickedValues'], g['lightness']);
                            }, 1000 * j);
                        })(g, j);
                    }
                }
            } else {
                var promises = [];
                for (i = 0; i < hueSceneObj['groups'].length; i++) {
                    g = hueSceneObj['groups'][i];
                    for (j = 0; j < g['lights'].length; j++) {
                        var hueBrightness = toHueBrightness(g['lightness']);

                        var p = promiseToSendModifyHueScene2Command(g['lights'][j], {
                            ct: g['pickedValues']['colorTemperature'] != -1 ? g['pickedValues']['colorTemperature'] : undefined,
                            hue: g['pickedValues']['hue'] != -1 ? g['pickedValues']['hue'] : undefined,
                            sat: g['pickedValues']['saturation'] != -1 ? g['pickedValues']['saturation'] : undefined,
                            bri: hueBrightness['bri'],
                            on: hueBrightness['on'],
                            transitiontime: hueSceneObj['transitiontime']
                        });
                        promises.push(p);
                    }
                }


                Q.allSettled(promises)
                    .then(function (results) {
                        var numSettled = 0;
                        results.forEach(function (result) {
                            if (result.state === "fulfilled") {
                                numSettled++;
                            }
                        });
                        api.hideLoadingOverlay();
                        if (promises.length == numSettled) {
                            handleSuccessForSceneChange(Utils.getLabel(MyConfig.LABEL_SCENE_SAVED));
                        } else {
                            handleFailureForSceneChange();
                        }
                    });
            }
        } catch (err) {
            Utils.logError('PhilipsHue2.modifyHueScene(): ' + err);
        }
    }

    function promiseToSendModifyHueScene2Command(lightId, opt) {
        var defer = Q.defer();

        console.log('lightId: ' + lightId + ', light values: ' + JSON.stringify(opt));

        api.performLuActionOnDevice(deviceId, SID, 'ModifyHueScene2', {
            actionArguments: {
                Scene: hueSceneObj.id,
                Lights: lightId,
                Data: JSON.stringify(opt)
            },
            onSuccess: function() {
                defer.resolve();
            },
            onError: function() {
                defer.reject();
            }
        });

        return defer.promise;
    }

    function sendModifyHueSceneCommand(lightId, pickedValues, lightness) {
        try {
            console.log("sendModifyHueSceneCommand for lightId: " + lightId + '...');
            var lightOption = {};
            lightOption.bri = lightness;
            if (Utils.int(pickedValues.colorTemperature) > -1) {
                lightOption.ct = pickedValues.colorTemperature;
            } else {
                lightOption.hue = pickedValues.hue;
                lightOption.sat = pickedValues.saturation;
            }

            console.log('API v1 -> ModifyHueScene for ' + lightId + ' and ' + JSON.stringify(lightOption));
            api.performLuActionOnDevice(api.getCpanelDeviceId(), SID, "ModifyHueScene", {
                actionArguments: {
                    Scene: hueSceneObj.id,
                    Lights: lightId,
                    Data: JSON.stringify(lightOption)
                },
                onSuccess: function () {
                    //console.log("scene saved");
                    handleSuccessForSceneChange(Utils.getLangString("ui7_hue_scene_saved", "Scene saved"));
                },
                onError: function () {
                    console.log("ERROR: failed to send ModifyHueScene for " + lightId);
                    api.hideLoadingOverlay();
                }
            });

        } catch (err) {
            Utils.logError('Error in PhilipsHue2.sendModifyHueSceneCommand(): ' + err);
        }
    }

    function saveHueLightness(sliderValue) {
        try {
            var lightsIdList = hueSceneObj.lights.split(",");

            for (var i = 0; i < lightsIdList.length; i++) {
                (function (i) {
                    setTimeout(function () {
                        console.log(lightsIdList[i]);
                        sendHueLightnessCommand(bridgeLightIdToUserDataLightId[lightsIdList[i]], sliderValue);
                    }, 1000 * i);
                })(i);
            }
        } catch (err) {
            Utils.logError('Error in saveHueLightness(): ' + err);
        }
    }
    function sendHueLightnessCommand(deviceId, lightnessLevel) {
        try {
            api.performLuActionOnDevice(deviceId, "urn:upnp-org:serviceId:Dimming1", "SetLoadLevelTarget", {
                actionArguments: {
                    newLoadlevelTarget: lightnessLevel
                },
                onSuccess: function () {
                },
                onError: function () {
                }
            });

        } catch (err) {
            Utils.logError('Error in PhilipsHueLamp2.sendHueLightnessCommand(): ' + err);
        }
    }
    function convertPhilpsHueToRegularHue(hue) {
        try {
            var regualrHue = Math.ceil(hue / 182.5487);
            return regualrHue;
        } catch (err) {

        }
    }
    function convertPhilpsSaturationToRegularSaturation(saturation) {
        try {
            var regualrSaturation = Math.ceil((saturation * 100) / 254);
            return regualrSaturation;
        } catch (err) {

        }
    }
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
    function saveHueLightsColoTemp() {
        try {
            var lightsIdList = hueSceneObj.lights.split(",");

            for (var i = 0; i < lightsIdList.length; i++) {
                (function (i) {
                    setTimeout(function () {
                        console.log(lightsIdList[i]);
                        sendHueLightsColoTemp(bridgeLightIdToUserDataLightId[lightsIdList[i]]);
                    }, 1000 * i);
                })(i);
            }
        } catch (err) {

        }
    }
    function sendHueLightsColoTemp(lightId) {
        try {
            api.performLuActionOnDevice(lightId, SID, ACTION_SET_COLOR_TEMP, {
                actionArguments: {
                    ColorTemperature: pickedValues['colorTemperature']
                }
            });
        } catch (err) {

        }
    }
    function setLigthnessLevel() {
        try {
            var ligthnessLevel = api.getDeviceState(selectedHueDeviceLights[0], "urn:upnp-org:serviceId:Dimming1", "LoadLevelTarget");
            if (ligthnessLevel) {
                $("#luminositySlider").slider("value", ligthnessLevel);
                var intensityValue = ligthnessLevel + ' %';
                $("#luminosityIntensity").html(intensityValue);
            }
        } catch (err) {
            Utils.logError('PhilipsHue.setLigthnessLevel(): ' + e);
        }
    }

    function readContentOfGetSceneValues() {
        application.variableGet(deviceId, SID, 'GetSceneValues').then(function(data){
            try {
                hueSceneValues = JSON.parse(data);
                console.log(hueSceneValues);
                api.hideLoadingOverlay();
                color_picker();
            } catch (err) {
                console.log('ERROR: cannot parse content of "GetSceneValues": ' + err);
                api.hideLoadingOverlay();
            }
        }).fail(function(){
            console.log('ERROR: Cannot read content of "GetSceneValues" !');
            api.hideLoadingOverlay();
        });
    }

	function infoTab(deviceId){
		var bridgeFWVersion = api.getDeviceState(deviceId, HUE_SID, 'BridgeFWVersion');
		var bridgeModel = api.getDeviceState(deviceId, HUE_SID, 'BridgeModel');

			if(typeof bridgeFWVersion == 'undefined'){
				bridgeFWVersion = "";
			}
			if(typeof bridgeModel == 'undefined'){
				bridgeModel = "";
			}

		var html ='<div class="clearfix philipsHueInfoContainer" id="' + MyConfig.CONTAINER_HUE_INFO + '">' +
				'	<div class="legendHeader"><h3>' + Utils.getLangString("ui7_philipsHue_bridgeInfo_section", "Bridge General Informations") + '</h3></div>' +
                    '	<div class="cpanelSection">' +
                    '		<div class="clearfix" style="padding-bottom:20px;">' +
                    '			<div class="pull-left boldLabel linkLabelStatusContainer">' + Utils.getLabel(MyConfig.LABEL_BRIDGE_FW_VERSION) + '</div>' +
                    '               <div class="pull-right bridgeFirmwareVersion">' + bridgeFWVersion + '</div>' +
                    '		</div>' +
				'		<div class="clearfix" style="padding-bottom:20px;">' +
                    '			<div class="pull-left boldLabel linkLabelStatusContainer">' + Utils.getLangString("ui7_philipsHue_bridgeInfo_section_bridgeModel", "Bridge Model") + '</div>' +
                    '               <div class="pull-right bridgeFirmwareVersion">' + bridgeModel + '</div>' +
                    '		</div>' +
                    '	</div>'+
				'	<div class="cpanelSection">' +
				'		<div class="clearfix" style="padding-top:20px;padding-bottom:20px;">' +
				'			<div class="pull-left boldLabel linkLabelStatusContainer" style="width:20%;">' + Utils.getLangString("ui7_philipsHue_bridgeInfo_compatibilityInfo", "Compatibility info") + '</div>' +
				// token "ui7_philipsHue_bridgeInfo_pluginInfoParagraph" contains the paragraph about "Plugin usage info"
				'         	<div class="pull-right pluginUsageInfo" style="width:80%;"><p>'+ Utils.getLangString("ui7_philipsHue_bridgeInfo_compatibilityInfoParagraph", "This plugin version is compatible with Hue bridges 1.0 and 2.0 and it only supports bridges with installed firmware version up to 1.11.0. <br>For newer devices that have firmware version bigger than 1.11.0, using this plugin may lead to undefined behavior.<br>This version is a stable version for bridges metioned above.") +'</p></div>' +
				'		</div>'+
				'	</div>'+
				'	<div class="cpanelSection">' +
				'		<div class="clearfix" style="padding-top:20px;padding-bottom:20px;">' +
				'			<div class="pull-left boldLabel linkLabelStatusContainer" style="width:20%;">' + Utils.getLangString("ui7_philipsHue_bridgeInfo_releaseNotesHeader", "Release notes") + '</div>' +
				// token "ui7_philipsHue_bridgeInfo_releaseNotesParagraph" contains the paragraph about "Release notes"
				'         	<div class="pull-right pluginUsageInfo" style="width:80%;"><p>'+ Utils.getLangString("ui7_philipsHue_bridgeInfo_releaseNotesParagraph", "Philips updated the Hue API and added additional features that allow improvement of 3rd party applications usability. The new changes introduced are listed below. <br>We will use 'V1' to refer to anything related to the Hue API used in firmware versions smaller than 1.11.0 and 'V2' for anything related to the Hue API used in firmware versions starting with 1.11.0<br>- delete Hue presets : only for presets created using API V2 method; In bridge versions earlier than 1.11.0, presets cannot be deleted from the bridge. <br>- updated Hue presets 'creation' mechanism according to the API V2 changes;<br>- added 'effect' and 'transitiontime' support in presets creation;<br>- updated Hue presets 'edit' mechanism according to the API V2 - editing V2 presets loading time is significantly improved; <br>- added 'effect' and 'transitiontime' support for Hue bulb devices;<br>- added plugin 'Information' page<br>- fixed the issue with 'On/Off' button on bridge device;<br>- added support for multiple Hue bridges found on the same network.<br><br>* Known issues:<br>- Hue preset list is not updated after creating a new preset") +'</p></div>' +
				'		</div>'+
				'	</div>'+
				'	<div class="cpanelSection">' +
				'		<div class="clearfix" style="padding-top:20px;padding-bottom:100px;">' +
				'			<div class="pull-left boldLabel linkLabelStatusContainer" style="width:20%;">' + Utils.getLangString("ui7_philipsHue_bridgeInfo_pluginInfoHeader", "Plugin usage info") + '</div>' +
				// token "ui7_philipsHue_bridgeInfo_pluginInfoParagraph" contains the paragraph about "Plugin usage info"
				'         	<div class="pull-right pluginUsageInfo" style="width:80%;"><p>'+ Utils.getLangString("ui7_philipsHue_bridgeInfo_pluginInfoParagraph", "- if a preset does not have a 'delete' button, it means that it is a V1 preset and cannot be deleted!<br>- 'effect' and 'transitiontime' can be set for a Hue bulb device in 'Color Picker' tab;<br>- 'effect' and 'transitiontime' can be set for a preset when it is created or modified;<br>- if multiple Hue bridges are found on the same network, you can chose the one that you want to be paired with plugin from the 'Configure' tab. <br>After selecting the desired bridge, you must click on the 'Save IP Address' button and then follow the pairing instructions.") +'</p></div>' +
				'		</div>'+
				'	</div>'+
				'</div>';

		api.setCpanelContent(html);
	}

    function refreshSceneList() {
        if ($('#hueBridgeSceneList').length > 0) {
            bridgeSceneList = getHueSceneList(deviceId, {
                sortByName: true
            });
            lightList = getBridgeHueLightsList(deviceId);
            lightDeviceIdList = application.getDeviceChildenIdList(deviceId);
            bridgeFavoriteScenesValue = api.getDeviceState(deviceId, "urn:micasaverde-com:serviceId:PhilipsHue1", "BridgeFavoriteScenes");

            // set the content...
            api.setCpanelContent(returnSceneListView(bridgeSceneList));

            // attach event handlers...
            addBehaviorToSceneButtons();
        }
    }

    function tabChanged(tabObject) {
        currentTab = typeof tabObject['Position'] !== 'undefined' ? tabObject['Position'] : 1;
    }

    function getVersion() {
        return JS_VERSION;
    }

    myModule = {
        uuid: uuid,
        init: init,
        cleanup: cleanup,
        establishHueLinkSuccess: establishHueLinkSuccess,
        establishHueLinkError: establishHueLinkError,
        configure: configure,
        sceneList: sceneList,
        reloadSceneList: reloadSceneList,
		redrawHueScenesViewAfterDelete: redrawHueScenesViewAfterDelete,
		reloadSceneListAfterDelete: reloadSceneListAfterDelete,
        refreshSceneList: refreshSceneList,
        getVersion: getVersion,
        tabChanged: tabChanged,
		infoTab: infoTab
    };

    return myModule;
})(api);
 
