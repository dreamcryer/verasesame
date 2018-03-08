local dkjson = require("dkjson")
local socket = require("socket")
local http = require("socket.http")
local https = require("ssl.https")
local mime = require ("mime")
local ltn12 = require("ltn12")
local params = {
	mode = "client",
	protocol = "tlsv1",
	verify = {"none"},
	options = {"no_compression"},
	ciphers = "ALL",
}

-- Flags
local DEBUG_MODE = false
local FAILED_STATUS_REPORT = true
local FLAGS = {
	LAMPS = false,
	BRIDGE = false,
	HANDLE_GROUPS = false
}

-- Table used to keep data on the IP's used by the bridge device!
local ip_table = {

}

-- empty at the start
local MAC_ADDRESS = ""
local IP_Subset = ""

-- Constants
local DEVICE_FILES = {
	MOTION_SENSOR      = "D_MotionSensor1.xml",
	DIMMABLE_LIGHT       = "D_DimmableLight1.xml"
}

local DEVICE_TYPES = {
	DIMMABLE_LIGHT       = "urn:schemas-upnp-org:device:DimmableLight:1"
}

local SID = {
	HUE    		= "urn:micasaverde-com:serviceId:PhilipsHue1",
	SWP 		= "urn:upnp-org:serviceId:SwitchPower1",
	DIM			= "urn:upnp-org:serviceId:Dimming1"
}

local TASK = {
	ERROR       = 2,
	ERROR_ALARM = -2,
	ERROR_STOP  = -4,
	SUCCESS     = 4,
	BUSY        = 1
}
-- LastUpdate
local DISPLAY_SECONDS = 20
local POLLING_RATE = 7 -- 30 --"PollFrequency"

-- Globals
local lug_device = nil
local g_appendPtr -- The pointer passed to luup.chdev.append
local g_taskHandle = -1
local g_lastTask = os.time() -- The time when the status message was last updated.
local g_ipAddress = ""
local g_UUID = nil
local g_username  = "testuser"
local g_lastState = ""
local g_lampNumber = 0
local g_groupNumber = 0
local g_sceneNumber = 0
local g_lamps = {

}
local g_groups = {
	-- .id
	-- .name
	-- ...
}
local g_scenes = {
	-- .id
	-- .name
	-- ...
}

local LANGUAGE_TOKENS
local lug_language
local lug_skinCRC32
---------------------------------------------------------
-----------------Generic Utils---------------------------
---------------------------------------------------------

local function debug (text)
	--luup.log(tostring(DEBUG_MODE))
	if (DEBUG_MODE == true) then
		luup.log("(Hue2 Plugin)::"..text)
	end
end

local function generateHueURL()
	local ipAddress = luup.attr_get("ip", lug_device)
	return "http://" .. ipAddress .. "/api"
end

function os.capture(cmd, raw)
	local f = assert(io.popen(cmd, 'r'))
	local s = assert(f:read('*a'))
	f:close()
	if raw then return s end
		s = string.gsub(s, '^%s+', '')
		s = string.gsub(s, '%s+$', '')
		s = string.gsub(s, '[\n\r]+', ' ')
	return s
end

function PingIpAndCheckMac(_device)
	local ip = g_ipAddress
	local getSubSet = ""
	local dotCounter = 0;
	for i = 1, #ip do
		local c = ip:sub(i, i)
		if c == "." then
			dotCounter = dotCounter + 1
			if dotCounter == 3 then
				getSubSet = string.sub(ip, 1, i)
				--debug("IP FULL: "..g_ipAddress.." | Subset: "..getSubSet.."")
				IP_Subset = getSubSet
			end
		end
	end

	-- PING THE BROADCAST TO POPULATE THE ARP LIST!
	os.execute("ping -c 1 -w "..IP_Subset.."255")

	MAC_ADDRESS = string.lower(luup.attr_get("mac", _device))
	local nIP = GetIpForMacAddress(lug_device, MAC_ADDRESS)
	return nIP
end


--TODO test function
function GetIpForMacAddress(_device, _macAddr)
	-- local stdoutARPFlush = io.popen("ip -s -s neigh flush all")
	-- stdoutARPFlush:close()
	local entry = ""
	for lines in io.lines("/proc/net/arp") do
		if string.find(lines, _macAddr) and string.find(lines,"0x0") == nil  then
			entry = string.sub(lines, 1, 16)
			entry = string.gsub(entry, " ", "")
		end
	end
	luup.log("IP FOR MAC IS: "..entry.." | ORIGINAL MAC: ".._macAddr.."")
	return entry
end

function clearTask()
	if (os.time() - g_lastTask >= DISPLAY_SECONDS) then
		if lug_language == "fr" then
			luup.task("Effancer...", TASK.SUCCESS, "Philips Hue", g_taskHandle)
		else
			luup.task("Clearing...", TASK.SUCCESS, "Philips Hue", g_taskHandle)
		end
	end
	debug("(clearTask) : Clearing task... ")
end

local function GET_LANG(token, default)
	if LANGUAGE_TOKENS and LANGUAGE_TOKENS[lug_language] and LANGUAGE_TOKENS[lug_language][token] then
		return LANGUAGE_TOKENS[lug_language][token]
	else
		return default
	end
end

local function printArray(array, func,text)
	for key,value in pairs(array) do
		if type(value) == "table" then
			debug("(".. func ..") : " .. text .. " " .. key .. " :" )
			for k,v in pairs(value) do
				if type(v) == "table" then
					for i,j in pairs(v) do
						if type(j) == "table" then
							for p,q in pairs(j) do
								debug("(".. func ..") : ".. text .. "[" .. tostring(key) .. "]." .. tostring(k) .. "[" .. tostring(i) .. "]." .. tostring(p) .. " = " .. tostring(q) )
							end
						else
							debug("(".. func ..") : ".. text .. "[" .. tostring(key) .. "]." .. tostring(k) .. "[" .. tostring(i) .. "] = " .. tostring(j) )
						end
					end
				else
					debug("(".. func ..") : ".. text .. "[" .. tostring(key) .. "]." .. tostring(k) .. " = " .. tostring(v) )
				end
			end
		else
			debug("(".. func ..") : ".. text .. "[" .. tostring(key) .. "] = " .. tostring(value) )
		end
	end
end

local function displayMessage (text, mode)
	if mode == TASK.ERROR_ALARM or mode == TASK.ERROR_STOP then
		luup.task(text, TASK.ERROR, "Philips Hue", g_taskHandle)
		if mode == TASK.ERROR_STOP then
			luup.set_failure(1, lug_device)
		end
		return
	end
	luup.task(text, mode, "Philips Hue", g_taskHandle)
	-- Set message timeout.
	g_lastTask = os.time()
	luup.call_delay("clearTask", DISPLAY_SECONDS)
end

local function GetLanguage()
	local file = io.open("/etc/cmh/language")
	if not file then
		debug("(GetLanguage): Cannot open /etc/cmh/language, returning default language!")
		return "en"
	end
	local language = file:read("*a")
	file:close()
	language = language:match("%a+")
	debug("(GetLanguage): Got language: ".. language)
	return language
end

local function LoadLanguageTokens()
	-- Check if the file exists.
	local f = io.open("/etc/cmh-ludl/philips_hue_language_tokens.txt.lzo")
	if f then
		f:close()
	else
		debug("(LoadLanguageTokens): lzo compressed file not found, using default values for tokens")
		return
	end
	os.execute("pluto-lzo d /etc/cmh-ludl/philips_hue_language_tokens.txt.lzo /etc/cmh-ludl/philips_hue_language_tokens.txt")
	language_file = loadfile("/etc/cmh-ludl/philips_hue_language_tokens.txt")

	if language_file then
		LANGUAGE_TOKENS = language_file()
		debug("(LoadLanguageTokens): language file loaded after decompress")
		
	else
		debug("(LoadLanguageTokens): language file not loaded after decompress, using default")
	end
	debug("Removing unused lzo language token")
	os.execute("rm -f /etc/cmh-ludl/philips_hue_language_tokens.txt.lzo")
end

local function UrlEncode (s)
	s = s:gsub("\n", "\r\n")
	s = s:gsub("([^%w])", function (c)
							  return string.format("%%%02X", string.byte(c))
						  end)
	return s
end

local function DEC_HEX(IN)
	local B,K,OUT,I,D=16,"0123456789ABCDEF","",0
	while IN>0 do
		I=I+1
		IN,D=math.floor(IN/B),math.mod(IN,B)+1
		OUT=string.sub(K,D,D)..OUT
	end
	if OUT == "" or OUT == "0" then
		return "00"
	elseif OUT == "1" then
		return "01"
	elseif OUT == "2" then
		return "02"
	elseif OUT == "3" then
		return "03"
	elseif OUT == "4" then
		return "04"
	elseif OUT == "5" then
		return "05"
	elseif OUT == "6" then
		return "06"
	elseif OUT == "7" then
		return "07"
	elseif OUT == "8" then
		return "08"
	elseif OUT == "9" then
		return "09"
	elseif OUT == "A" then
		return "0A"
	elseif OUT == "B" then
		return "0B"
	elseif OUT == "C" then
		return "0C"
	elseif OUT == "D" then
		return "0D"
	elseif OUT == "E" then
		return "0E"
	elseif OUT == "F" then
		return "0F"
	else
		return OUT
	end
end

local function getLength(var)
	local i = 0
	for k,v in pairs(var) do
		i = i + 1
	end
	return i
end

function round(x)
	if x%2 ~= 0.5 then
		return math.floor(x+0.5)
	end
	return x-0.5
end

local function clamp(x,min,max)
	if x < min then
        return round(min)
	end
	if x > max then
		return round(max)
	end
	return round(x)
end

local function mirekToKelvin(value)
	local mirek = 6500-(value-153)*12,9682997118
	return mirek
end

local function convertColorTemperatureToHex(colortemperature)
	local kelvin = 6500 - (colortemperature - 153) * 12,9682997118
	local temp = kelvin / 100
    local red, green, blue
	if temp <= 66 then
		red = 255
		green = temp
		green = 99.4708025861 * math.log(green) - 161.1195681661
		if temp <= 19 then
			blue = 0
		else
			blue = temp - 10
			blue = 138.5177312231 * math.log(blue) - 305.0447927307
		end
    else
		red = temp - 60
		red = 329.698727446 * math.pow(red, -0.1332047592)
		green = temp - 60
		green = 288.1221695283 * math.pow(green, -0.0755148492)
		blue = 255
    end
	return "#" .. DEC_HEX(clamp(red, 0, 255)) .. DEC_HEX(clamp(green, 0, 255)) .. DEC_HEX(clamp(blue, 0, 255))
end

local function HueToRgb(p,q,t)
	if t < 0 then
		t = t + 1
	elseif t > 1 then
		t = t - 1
	end
	if t < 1/6 then
		return p + (q - p) * 6 * t
	elseif t < 1/2 then
		return q;
	elseif t < 2/3 then
		return p + (q - p) * (2/3 - t) * 6
	end
	return p
end

local function convertHslToHex(h,s)
	local l = 0.7 - (s - 200 ) * 0.0036363636363
	local r,g,b
	h = h/65535
	s = s/255
	if s == 0 then
		r = 1
		g = 1
		b = 1
	else
		local q
		if l < 0.5 then
			q = l * (1 + s)
		else
			q = l + s - l * s
		end

		local p = 2 * l - q
		r = HueToRgb(p, q, h + 1/3)
		g = HueToRgb(p, q, h)
		b = HueToRgb(p, q, h - 1/3)
	end
	return "#" .. DEC_HEX(round(r * 255)) .. DEC_HEX(round(g * 255)) .. DEC_HEX(round(b * 255))
end

local function GetSkinCRC32()
	local DEFAULT_SKIN_CRC32 = -2073602173
	local nixio = require("nixio")
	if not nixio then
		debug("(GetSkinCRC32) : Failed to load nixio", 1)
		return DEFAULT_SKIN_CRC32
	end
	local skin = ""
	local file = io.open("/etc/cmh/ui_skin", "r")
	if file then
		skin = file:read()
		file:close()
	else
		debug("(GetSkinCRC32) : Failed to open ui_skin", 1)
		return DEFAULT_SKIN_CRC32
	end
	local skinCRC32 = nixio.bin.crc32(skin)
	debug("(GetSkinCRC32) : Got skin from file: ".. tostring(skin) ..", crc32: ".. skinCRC32)
	return skinCRC32
end
---------------------------------------------------------
---------------Action Implementations--------------------
---------------------------------------------------------
function bridgeConnect(lug_device)
	debug("(bridgeConnect) : Linking with the Bridge device")
	local deviceType = "Vera" .. luup.pk_accesspoint
	local jsondata = { devicetype = deviceType}
    local postdata = dkjson.encode(jsondata)
    local body, status, headers = http.request(generateHueURL(), postdata)
    local json_response = dkjson.decode(body)

	local linkError = false
    local otherError = false
    local errorDescription = ""
	if json_response ~= nil then
		for key, value in pairs(json_response) do
			if value.error ~= nil then
				if value.error.type == 101 then
					linkError = true
					break
				else
					otherError = true
					errorDescription = value.error.description
					break
				end
			end
			if value.success then
				local username = value.success.username
				luup.attr_set("username", username, lug_device)
				break
			end
	    end

		if linkError then
			luup.variable_set(SID.HUE, "Status", GET_LANG("philips_hue_2_press_pair_button", "Please press the link button on the Bridge and hit the Pair button again!"), lug_device)
			luup.variable_set(SID.HUE, "BridgeLink", "0", lug_device)
			displayMessage(GET_LANG("philips_hue_2_press_pair_button", "Please press the link button on the Bridge and hit the Pair button again!"), TASK.BUSY)
			debug( "(bridgeConnect) : Please press the link button on the Bridge and hit the Pair button again!" )
		elseif otherError then
			luup.variable_set(SID.HUE, "Status", GET_LANG("philips_hue_2_link_error", "Linking ERROR occurred: ") .. errorDescription , lug_device)
			debug( "(bridgeConnect) : Linking ERROR occurred: " .. errorDescription )
		else
			local bridgeLink = luup.variable_get(SID.HUE, "BridgeLink", lug_device) or ""
			if bridgeLink == "0" then
				luup.variable_set(SID.HUE, "BridgeLink", "1", lug_device)
				debug("Philips Hue bridge link changed .. Reloading")
				luup.reload()
			end

			luup.variable_set(SID.HUE, "Status", GET_LANG("philips_hue_2_connected", "Philips Hue Connected!"), lug_device)
			displayMessage(GET_LANG("philips_hue_2_connected", "Philips Hue Connected!"), TASK.BUSY)
			debug( "(bridgeConnect) : Philips Hue Connected!" )
		end
	end
end

local function getIconVal(colormode, value)
	if colormode == "hs" or colormode == "xy" then
		if value >= 0 and value <= 3900 then
			return "R"
		elseif value > 3900 and value <= 8500 then
			return "O"
		elseif value > 8500 and value <= 13700 then
			return "Y"
		elseif value > 13700 and value <= 29500 then
			return "G"
		elseif value > 29500 and value <= 34700 then
			return "C"
		elseif value > 34700 and value <= 47500 then
			return "B"
		elseif value > 47500 and value <= 49100 then
			return "V"
		elseif value > 49100 and value <= 62250 then
			return "M"
		elseif value > 62250 and value <= 65535 then
			return "R"
		else
			return "W"
		end
	elseif colormode == "ct" then
		if value > 0 and value <= 300 then
			return "ABB"
		elseif value > 300 and value <= 350 then
			return "ABW"
		elseif value >350 and value <= 500 then
			return "ABY"
		else
			return "ABW"
		end
	else
		return "ABW"
	end
end

function setLoadLevelTarget(lul_settings, device)
	local newLoadlevelTarget
	if lul_settings.newTargetValue then
		if tonumber(lul_settings.newTargetValue) > 0 then
			newLoadlevelTarget = "100"
		else
			newLoadlevelTarget = "0"
		end
	elseif lul_settings.newLoadlevelTarget then
		newLoadlevelTarget = lul_settings.newLoadlevelTarget
	else
		debug("(setLoadLevelTarget) : We shouldn't be here!!!")
		return false
	end
	-- Philips Hue Color Temperatures
	local colors = {
		energize = {hue = 34495, sat = 232, ct = 155, name = 'Energize'},
		concentrate = {hue = 33849, sat = 44, ct = 234, name = 'Concentrate'},
		reading = {hue = 15331, sat = 121, ct = 343, name = 'Reading'},
		warm = {hue = 14563, sat = 160, ct = 385, name = 'Warm'},
		natural = {hue = 15223, sat = 127, ct = 349, name = 'Natural'},
		relax = {hue = 13198, sat = 209, ct = 463, name = 'Relax'},
	}
	-- Check for UI7 All On/Off Command
	if lul_settings.Category then
		local isGroupOnOff = false
			for k,v in pairs(g_groups) do
				if tonumber(v.veraid) == device then
				isGroupOnOff = true
			end
		end
		if tonumber(lul_settings.Category) == 999 and isGroupOnOff == false then
			if tonumber(lul_settings.newTargetValue) > 0 then
				newLoadlevelTarget = 50
				--setColorTemperature(colors.relax.ct, device)
			else
				newLoadlevelTarget = 0
			end
		else
			debug("(setLoadLevelTarget) : Group is not affected by All On/Off command, returning ...")
			return false
		end
	end

	luup.variable_set(SID.DIM, "LoadLevelStatus", newLoadlevelTarget, device)
	luup.variable_set(SID.DIM, "LoadLevelTarget", newLoadlevelTarget, device)
	if tonumber(newLoadlevelTarget) > 0 then
		luup.variable_set(SID.SWP, "Status", "1", device)
	else
		luup.variable_set(SID.SWP, "Status", "0", device)
	end
	local brightness = math.floor(tonumber(newLoadlevelTarget) * 254 / 100 + 0.5)

	local lampID = ""
	local isGroup = false
	for key, val in pairs(g_lamps) do
		if tonumber(val.veraid) == device then
			lampID = val.hueid
		end
	end

	if lampID == "" then
		for key, val in pairs(g_groups) do
			if tonumber(val.veraid) == device then
				lampID = val.hueid
				isGroup = true
			end
		end
	end
	if tostring(newLoadlevelTarget) == "0" then
		if isGroup then
			if setLampValues(lampID, "group", "on", false, "bri", brightness) then
				return true
			else
				return false
			end
		else
			if setLampValues(lampID, "light", "on", false, "bri", brightness) then
				return true
			else
				return false
			end
		end
	else
		if isGroup then
			if setLampValues(lampID, "group", "on", true, "bri", brightness) then
				return true
			else
				return false
			end
		else
			if setLampValues(lampID, "light", "on", true, "bri", brightness) then
				return true
			else
				return false
			end
		end
	end
end

function turnOffLamp(lamp)
	setLampValues(lamp, "light", "on", false)
end

function setStateForAll(state, device)
	local data = {}
	if state == "0" then
		data["on"] = false
	elseif state == "1" then
		data["on"] = true
	else
		debug("(setStateForAll) : We shouldn't be here!")
		return false
	end
	local senddata = dkjson.encode(data)
	local body = putToHue(senddata, 0, "group")
	local json = dkjson.decode(body)
	local flagError = false
	if json ~= nil then
		for key, value in pairs(json) do
			if (value.error ~= nil) then
				debug( "(setStateForAll) : Setting state for all bulbs ERROR occurred : " .. value.error.type .. " with description : " .. value.error.description)
				flagError = true
			end
	    end
	else
		flagError = true
	end

	if flagError == false then
		debug("(setStateForAll) : Successfully changed state for all hue bulbs!")
		luup.variable_set(SID.HUE, "StateForAll", state, device)
		return true
	else
		debug("(setStateForAll) : Please check error/s above!")
		return false
	end
end
function setHueAndSaturation(hue, saturation, effect, transitiontime, device)
	debug("(setHueAndSaturation) : Starting...")
	local lampID = ""
	local on_val
	local isGroup = false
	for key, val in pairs(g_lamps) do
		if tonumber(val.veraid) == device then
			lampID = val.hueid
			on_val = val.on
		end
	end
	if lampID == "" then
		for key, val in pairs(g_groups) do
			if tonumber(val.veraid) == device then
				lampID = val.hueid
				on_val = val.on
				isGroup = true
			end
		end
	end
	local value = "hue:".. hue .. ";sat:" .. saturation
	luup.variable_set(SID.HUE, "LampValues", value, device)
	luup.variable_set(SID.HUE, "LampHexValue", convertHslToHex(hue,saturation), device)
	debug("(setHueAndSaturation) : on_val = ".. tostring(on_val))

	local effectValue = ""
	local transitiontimeValue
	if not effect then
		effectValue = "none"
	else
		effectValue = effect
	end

	if not transitiontime then
		transitiontimeValue = 0
	else
		transitiontimeValue = tonumber(transitiontime)
	end

	debug("(setColorTemperature) : effect = [".. tostring(effectValue) .. "]")
	debug("(setColorTemperature) : transitiontime = [".. tostring(transitiontimeValue) .. "]")
	if on_val then
		if isGroup then
			if setLampValues(lampID, "group", "hue", tonumber(hue), "sat", tonumber(saturation)) then
				return true
			else
				return false
			end
		else
			if setLampValues(lampID, "light", "hue", tonumber(hue), "sat", tonumber(saturation), "effect", effectValue, "transitiontime", transitiontimeValue) then
				return true
			else
				return false
			end
		end
	else
		if isGroup then
			if setLampValues(lampID, "group", "on", true, "hue", tonumber(hue), "sat", tonumber(saturation)) then
				return true
			else
				return false
			end
		else
			if setLampValues(lampID, "light", "on", true, "hue", tonumber(hue), "sat", tonumber(saturation), "effect", effectValue, "transitiontime", transitiontimeValue) then
				return true
			else
				return false
			end
		end
		--luup.call_delay( "turnOffLamp", 5, lampID)
	end
end

function setColorTemperature(colortemperature, effect, transitiontime, device)
	debug("(setColorTemperature) : CT = " .. colortemperature)
	local lampID = ""
	local on_val
	local isGroup = false
	for key, val in pairs(g_lamps) do
		if tonumber(val.veraid) == device then
			lampID = val.hueid
			on_val = val.on
		end
	end
	if lampID == "" then
		for key, val in pairs(g_groups) do
			if tonumber(val.veraid) == device then
				lampID = val.hueid
				on_val = val.on
				isGroup = true
			end
		end
	end
 	luup.variable_set(SID.HUE, "LampValues", "ct:" .. colortemperature, device)
	luup.variable_set(SID.HUE, "LampHexValue", convertColorTemperatureToHex(colortemperature), device)
	debug("(setColorTemperature) : on_val = ".. tostring(on_val))

	local effectValue = ""
	local transitiontimeValue
	if not effect then
		effectValue = "none"
	else
		effectValue = effect
	end

	if not transitiontime then
		transitiontimeValue = 0
	else
		transitiontimeValue = tonumber(transitiontime)
	end
	debug("(setColorTemperature) : effect = [".. tostring(effectValue) .. "]")
	debug("(setColorTemperature) : transitiontime = [".. tostring(transitiontimeValue) .. "]")
	if on_val then
		if isGroup then
			if setLampValues(lampID, "group", "ct", tonumber(colortemperature)) then
				return true
			else
				return false
			end
		else
			if setLampValues(lampID, "light", "ct", tonumber(colortemperature), "transitiontime", transitiontimeValue) then
				return true
			else
				return false
			end
		end
	else
		if isGroup then
			if setLampValues(lampID, "group", "on", true, "ct", tonumber(colortemperature)) then
				return true
			else
				return false
			end
		else
			if setLampValues(lampID, "light", "on", true, "ct", tonumber(colortemperature), "transitiontime", transitiontimeValue) then
				return true
			else
				return false
			end
		end
		--luup.call_delay( "turnOffLamp", 5, lampID)
	end
end

function putToHue(data, hueid, hueStructure)
    debug("Hue2 Plugin)::(putToHue):data=" .. data)
    local len = string.len(data)
	local URL = ""
	if hueStructure == "group" then
		URL = generateHueURL() .. "/" .. g_username .. "/groups/" .. hueid .. "/action"
	elseif hueStructure == "light" then
		URL = generateHueURL() .. "/" .. g_username .. "/lights/" .. hueid .. "/state"
	elseif hueStructure == "scene" then
		URL = generateHueURL() .. "/" .. g_username .. "/scenes/" .. hueid
	elseif hueStructure == "Mscene" then
		local sceneName = hueid:match("^(.*),")
		local lightID = hueid:match(",(.*)$")
		URL = generateHueURL() .. "/" .. g_username .. "/scenes/" .. sceneName .. "/lights/" .. lightID .. "/state"
	elseif hueStructure == "lightstates" then
		local sceneID = hueid:match("^(.*),")
		local lightID = hueid:match(",(.*)$")
		URL = generateHueURL() .. "/" .. g_username .. "/scenes/" .. sceneID .. "/lightstates/" .. lightID
	end

    local bodyparts = { }
    local x, status, headers = http.request {
      url = URL,
      headers = {["content-length"] = len},
      source = ltn12.source.string(data),
      sink = ltn12.sink.table(bodyparts),
      method = "PUT"
    }
    local body = table.concat(bodyparts)
    return body
end

function setLampValues(light_id, hueStructure, ...)
	local lampID = tonumber(light_id, 10)
	local deviceID
	local arg = {...}
	if #arg % 2 ~= 0 then
		debug( "(setLampValues) : ERROR : Wrong number of arguments!")
		return false
	end
	local data = {}
	for i = 1,#arg,2  do
		data[arg[i]] = arg[i+1]
	end

	if hueStructure == "group" then
		deviceID = g_groups[lampID].veraid
	else
		deviceID = g_lamps[lampID].veraid
	end

	for key,val in pairs(data) do
		if key == "bri" then
			if val == 0 then
				data[key] = 1
				if hueStructure == "group" then
					g_groups[lampID].bri = 1
				elseif hueStructure == "light" then
					g_lamps[lampID].bri = 1
				end
			end
		end
		if key == "hue" then
			local iconVal = getIconVal("hs", val)
			if hueStructure == "group" then
				luup.variable_set(SID.HUE, "IconValue", iconVal, g_groups[lampID].veraid)
			else
				luup.variable_set(SID.HUE, "IconValue", iconVal, g_lamps[lampID].veraid)
			end
		end
		if key == "ct" then
			local iconVal = getIconVal("ct", val)
			if hueStructure == "group" then
				luup.variable_set(SID.HUE, "IconValue", iconVal, g_groups[lampID].veraid)
			else
				luup.variable_set(SID.HUE, "IconValue", iconVal, g_lamps[lampID].veraid)
			end
		end
	end

    local senddata = dkjson.encode(data)
	local body = putToHue(senddata, light_id, hueStructure)
	local json = dkjson.decode(body)

	local flagError = false

	for key, value in pairs(json) do
		if (value.error ~= nil) then
			debug( "(setLampValues) : Changing lamp/group status ERROR occurred : " .. value.error.type .. " with description : " .. value.error.description)
			flagError = true
		end
    end

	if flagError == false then
		debug("(setLampValues) : Successfully changed lamp/group status for device " .. deviceID .. " !")
		return true
	else
		debug("(setLampValues) : Please check error/s above!")
		return false
	end
end

local function getLightName(light_id)
	for k,v in pairs(g_lamps) do
		if tostring(v.hueid) == tostring(light_id) then
			return v.name .. "," .. v.veraid
		end
	end
end

local function getGroupLights(group_hue_id)
	local groupLights = ""
	for key,val in pairs(g_groups) do
		if val.hueid == group_hue_id then
			for k,v in pairs(val.lights) do
				groupLights = groupLights .. v .. "," .. getLightName(v) .. ";"
			end
		end
	end
	return groupLights:sub(1,#groupLights - 1)
end

local function appendLamps()
	debug("(appendLamps) : Verifying... ")
	local count = 0
	for i, v in pairs(g_lamps) do
		debug("(appendLamps) : Appending Lamp ".. i ..".")
		if v.manufacturer == 'philips' then
			if v.huetype == "Dimmable light" then
				luup.chdev.append(lug_device, g_appendPtr, "hueLamp_"..v.hueid, "HueLux ".. v.hueid ..": ".. v.name, "", "D_PhilipsHueLuxLamp2.xml", nil, "urn:micasaverde-com:serviceId:PhilipsHue1,BulbModelID=" .. v.modelid .. "\nurn:upnp-org:serviceId:Dimming1,TurnOnBeforeDim=0", false)
				count = count + 1
			elseif v.huetype == "Dimmable plug-in unit" then
				luup.chdev.append(lug_device, g_appendPtr, "hueLamp_".. v.hueid, "HueLW ".. v.hueid ..": ".. v.name, "", DEVICE_FILES.DIMMABLE_LIGHT, nil, "urn:micasaverde-com:serviceId:PhilipsHue1,BulbModelID=" .. v.modelid .. "\nurn:upnp-org:serviceId:Dimming1,TurnOnBeforeDim=0", false)
				count = count + 1
			else
				luup.chdev.append(lug_device, g_appendPtr, "hueLamp_"..v.hueid, "HueLamp ".. v.hueid ..": ".. v.name, "", "D_PhilipsHueLamp2.xml", nil, "urn:micasaverde-com:serviceId:PhilipsHue1,BulbModelID=" .. v.modelid .. "\nurn:upnp-org:serviceId:Dimming1,TurnOnBeforeDim=0", false)
			end
		elseif v.manufacturer == 'innr' then
			if v.huetype == "Dimmable light" then
				luup.chdev.append(lug_device, g_appendPtr, "hueLamp_"..v.hueid, "Innr ".. v.hueid ..": ".. v.name, "", "D_PhilipsHueLuxLamp2.xml", nil, "urn:micasaverde-com:serviceId:PhilipsHue1,BulbModelID=" .. v.modelid .. "\nurn:upnp-org:serviceId:Dimming1,TurnOnBeforeDim=0", false)
			end
		elseif v.manufacturer == 'cree' then
			if v.modelid == "Connected" or v.modelid == "" then
				luup.chdev.append(lug_device, g_appendPtr, "hueLamp_"..v.hueid, "CreeConnected ".. v.hueid ..": ".. v.name, "", "D_PhilipsHueLuxLamp2.xml", nil, "urn:micasaverde-com:serviceId:PhilipsHue1,BulbModelID=" .. v.modelid .. "\nurn:upnp-org:serviceId:Dimming1,TurnOnBeforeDim=0", false)
				count = count + 1
			end
		elseif v.manufacturer == "osram" then
			if v.huetype == "Extended color light" or v.huetype == "Color temperature light" then
				luup.chdev.append(lug_device, g_appendPtr, "hueLamp_"..v.hueid, "Osram ".. v.hueid ..": ".. v.name, "", "D_PhilipsHueLamp2.xml", nil, "urn:micasaverde-com:serviceId:PhilipsHue1,BulbModelID=LCT001\nurn:upnp-org:serviceId:Dimming1,TurnOnBeforeDim=0", false)
			end
		elseif v.manufacturer == "dresden elektronik" then
			if v.huetype == "Dimmable light" then
				luup.chdev.append(lug_device, g_appendPtr, "hueLamp_"..v.hueid, "Dresden Dimmable ".. v.hueid ..": ".. v.name, "", "D_PhilipsHueLuxLamp2.xml", nil, "urn:micasaverde-com:serviceId:PhilipsHue1,BulbModelID=LWB004\nurn:upnp-org:serviceId:Dimming1,TurnOnBeforeDim=0", false)
			else
				luup.chdev.append(lug_device, g_appendPtr, "hueLamp_"..v.hueid, "Dresden Colored ".. v.hueid ..": ".. v.name, "", "D_PhilipsHueLamp2.xml", nil, "urn:micasaverde-com:serviceId:PhilipsHue1,BulbModelID=LCT001\nurn:upnp-org:serviceId:Dimming1,TurnOnBeforeDim=0", false)
			end
		end

		if count > 80 then
			debug("(appendLamps) : Possible error in generating lamps function, more then 80 devices were generated!!!")
			return
		end
	end
end

local function appendGroups()
	debug("(appendGroups) : Verifying... ")
	if #g_groups > 0 then
		local count = 0
		for i, v in pairs(g_groups) do
			if v.huetype == "LightGroup" then
				--debug("(appendGroups) : Appending Group ".. i ..".")
				--luup.chdev.append(lug_device, g_appendPtr, "hueGroup_".. v.hueid, "HueGroup ".. v.hueid ..": ".. v.name, "urn:schemas-micasaverde-com:device:PhilipsHueLamp:1", "D_PhilipsHueLamp2.xml", nil, "urn:micasaverde-com:serviceId:PhilipsHue1,GroupType=NLG\nurn:upnp-org:serviceId:Dimming1,TurnOnBeforeDim=0", false)
				--count = count + 1
				debug("(appendGroups) : Not handled!")
			elseif v.huetype == "Luminaire" then
				debug("(appendGroups) : Appending Luminaire Group ".. i ..".")
				local GroupType = ""
				if v.modelid == "HML001" or v.modelid == "HML002" or v.modelid == "HML003" or v.modelid == "HML007" then
					GroupType = "CTM"
				else
					GroupType = "CLM"
				end
				local services = "urn:micasaverde-com:serviceId:PhilipsHue1,GroupType=" .. GroupType .. "\nurn:micasaverde-com:serviceId:PhilipsHue1,BulbModelID=" .. v.modelid  .. "\nurn:upnp-org:serviceId:Dimming1,TurnOnBeforeDim=0"
				luup.chdev.append(lug_device, g_appendPtr, "hueGroup_".. v.hueid, "HueLuminaire ".. v.hueid ..": ".. v.name, "", "D_PhilipsHueMultisourceLuminaireLamp2.xml", nil, services, false)
				count = count + 1
			end
			if count > 50 then
				debug("(appendGroups) : Possible error in generating lamps function, more then 50 devices were generated!!!")
				return
			end
		end
	else
		debug("(appendGroups) : No supported groups found!")
	end
end

local function appendLivingWhites()
	debug("(appendLivingWhites) : Verifying... ")
	for k,v in pairs(g_lw) do
		debug("(appendLivingWhites) : LW " .. k .. " :" )
		for key,val in pairs(v) do
			debug("(appendLivingWhites) : LW[" .. tostring(k) .. "]." .. tostring(key) .." = [" .. tostring(val) .. "]")
		end
	end
	if getLength(g_lw) > 0 then
		local count  = 0
		for i, v in pairs(g_lw) do
			debug("(appendLivingWhites) : Appending LivingWhites ".. v.name ..".")
			luup.chdev.append(lug_device, g_appendPtr, "hueLW_".. v.hueid, "HueLivingWhites ".. v.hueid ..": ".. v.name, "", DEVICE_FILES.DIMMABLE_LIGHT, nil, "urn:micasaverde-com:serviceId:PhilipsHue1,BulbModelID=" .. v.modelid .. "\nurn:upnp-org:serviceId:Dimming1,TurnOnBeforeDim=0", false)
			count = count + 1
			if count > 20 then
				debug("(appendLivingWhites) : Possible error in generating LivingWhites, more then 20 devices were generated!!!")
				return
			end
		end
	else
		debug("(appendLivingWhites) : No LivingWhites found!")
	end
end
---------------------------------------------------------
---------------Initialization Functions------------------
---------------------------------------------------------
local function getChildDevices(device)
	for dev, attr in pairs(luup.devices) do
		if (attr.device_num_parent == device) then
			local LampNo = attr.id:match("^hueLamp_(%d+)")
			if LampNo then
				for k,v in pairs(g_lamps) do
					if LampNo == tostring(v.hueid) then
						g_lamps[tonumber(v.hueid)].veraid = dev
					end
				end
			end
			local GroupNo = attr.id:match("^hueGroup_(%d+)")
			if GroupNo then
				for k,v in pairs(g_groups) do
					if GroupNo == tostring(v.hueid) then
						g_groups[tonumber(v.hueid)].veraid = dev
					end
				end
			end
		end
	end
end

local function findBridge()
	-- Try to get the bridge IP via nupnp
	--TODO Add backwards compatibility to get MAC address and ID for previous installations
	--local content = {}
	debug("(findBridge) : Trying to get IP via NUPNP...")
	-- local  body, code, headers, status = https.request {
		-- method = "GET",
		-- url = "https://www.meethue.com/api/nupnp",
		-- headers = {},
		-- sink = ltn12.sink.table(content)
	-- }
	-- content = table.concat(content)
	
	local status, content = luup.inet.wget("https://www.meethue.com/api/nupnp")
	if content then
		debug("nupnp "..(content or "no content ") .. " status " .. status)
		local contentJson = dkjson.decode(content)
		local bridges = ""
		for k,v in pairs(contentJson) do
			bridges = bridges .. "Bridge " .. k .. "," .. v.internalipaddress .. "," .. v.id .. ";"
		end
		if contentJson[1] ~= nil then
			if contentJson[1].internalipaddress == nil then
				debug("meethue.com/api/nupnp cannot be reached")
			else
				--luup.device_message(lug_device, 4, "IP Found via NUPnP", 2, "Philips Hue")
			end
		end
		debug("(findBridge) : bridges: " .. bridges)
		luup.variable_set(SID.HUE, "Bridges", bridges, lug_device)
		local IP = luup.attr_get("ip", lug_device)
		if IP == "" and bridges == "" then
			debug("(findBridge) : Philips Hue Bridge/s could not be found! You can try to manually insert the bridge IP and hit the the 'Save IP Address' button")
			-- there are no bridges found, user can try to manually insert the bridge ip
			luup.variable_set(SID.HUE, "Status", GET_LANG("philips_hue_2_bridge_not_found_manual_configure", "Philips Hue Bridge/s could not be found! You can try to manually insert the bridge IP and click on the 'Save IP Address' button"), lug_device)
			FLAGS.BRIDGE = false
			return false
		elseif IP == "" and bridges ~= "" then
			-- plugin was not configured and on or more briudges were found
			if #contentJson == 1 then
				-- only one bridge detected, automatically get the IP
				debug("(findBridge) : Philips Hue Bridge found with IP address: " .. contentJson[1].internalipaddress)
				SetBridgeIp(contentJson[1].internalipaddress, "0")
				luup.variable_set(SID.HUE, "Status", GET_LANG("philips_hue_2_bridge_found", "Philips Hue Bridge has been discovered!"), lug_device)
				FLAGS.BRIDGE = true
				PrepareFirstRunAfterBridgeConnection(contentJson[1].internalipaddress)
				return true
			else
				-- multiple bridres detected, user need to select the desired one
				debug("(findBridge) : Multiple Philips Hue Bridge/s found! Please select the desired one and click on the 'Save IP Address' button")
				luup.variable_set(SID.HUE, "Status", GET_LANG("philips_hue_2_bridge_found_select_bridge_to_pair", "Multiple Philips Hue Bridge/s found! Please select the desired one and click on the 'Save IP Address' button"), lug_device)
				FLAGS.BRIDGE = false
				luup.device_message(lug_device, 2, "Multiple Philips Hue Bridge/s found! Please select the desired one and click on the 'Save IP Address' button", 10, "Philips Hue")
				return false
			end
		elseif IP ~= "" and bridges == "" then
			
			debug("(findBridge) : Hue bridge could not be found automatically! You can try to manually insert the IP address of the bridge and click on the 'Save IP Address' button")
			MAC_ADDRESS = string.lower(luup.attr_get("mac", _device))
			local nIP = GetIpForMacAddress(lug_device, MAC_ADDRESS)

			if nIP ~= nil then
				luup.attr_set("ip", nIP, lug_device)
				luup.variable_set(SID.HUE, "Status", GET_LANG("philips_hue_2_bridge_continue", "Continuing with actual configuration..."), lug_device)
				FLAGS.BRIDGE = true
				return true
			else
				luup.variable_set(SID.HUE, "Status", GET_LANG("philips_hue_2_bridge_manually_set", "Hue bridge could not be found automatically! You can try to manually insert the IP address of the bridge and click on the 'Save IP Address' button"), lug_device)
				FLAGS.BRIDGE = false
				return false
			end
		else
			--find the right device using ID
			for k,v in pairs(contentJson) do
				local bridgeId = luup.variable_get(SID.HUE, "BridgeId", lug_device)
				if bridgeId ~= nil then
					if string.lower(v.id) == string.lower(bridgeId) then
						debug(IP.. " "..v.internalipaddress)
						if IP ~= v.internalipaddress then
							debug("(findBridge) : Found new bridge IP..." ..v.internalipaddress)
						end
						IP = v.internalipaddress
					end
				end
			end
			SetBridgeIp(IP, "1")
			debug("(findBridge) : Continuing with actual configuration...")
			luup.device_message(lug_device, 4, "Bridge connection established", 7, "Philips Hue")
			PrepareFirstRunAfterBridgeConnection(IP)
			luup.variable_set(SID.HUE, "Status", GET_LANG("philips_hue_2_bridge_continue", "Continuing with actual configuration..."), lug_device)
			FLAGS.BRIDGE = true
			return true
		end
	else
		MAC_ADDRESS = string.lower(luup.attr_get("mac", _device))
		local newBridgeIp = GetIpForMacAddress(lug_device, MAC_ADDRESS)
		if newBridgeIp ~= nil and newBridgeIp ~= " " then
			luup.attr_set("ip", newBridgeIp, lug_device)
			SetBridgeIp(newBridgeIp, "1")
			debug("(findBridge) : Found Bridge")
			FLAGS.BRIDGE = true
			return true
		else
			debug("(findBridge) : Philips Hue Bridge could not be found!")
			luup.variable_set(SID.HUE, "Status", GET_LANG("philips_hue_2_bridge_not_found", "Philips Hue Bridge/s could not be found!"), lug_device)
			FLAGS.BRIDGE = false
			return false
		end
	end
end

local function getDevices(json)
	local length = 0
	-- Get LampS Info
	if json.lights then
		length = getLength(json.lights)
		if length > 0 then
			g_lampNumber = length
			for key, val in pairs(json.lights) do
				local k = tonumber(key)
				local manufacturer = "philips"
				if val.manufacturername then
					manufacturer = string.gsub(string.lower(val.manufacturername), '%s+', '')
				end
				if manufacturer == "philips" then
					if val.type == "Dimmable light" then
						g_lamps[k] = {}
						g_lamps[k].manufacturer = manufacturer
						g_lamps[k].hueid = key
						g_lamps[k].on = val.state.on
						g_lamps[k].bri = val.state.bri or 0
						g_lamps[k].huetype = val.type
						g_lamps[k].name = val.name
						g_lamps[k].modelid = val.modelid
						g_lamps[k].reachable = val.state.reachable or false
					elseif val.type == "Dimmable plug-in unit" or val.type == "Color temperature light" then
						g_lamps[k] = {}
						g_lamps[k].manufacturer = manufacturer
						g_lamps[k].hueid = key
						g_lamps[k].on = val.state.on
						g_lamps[k].bri = val.state.bri or 0
						g_lamps[k].huetype = val.type
						g_lamps[k].name = val.name
						g_lamps[k].modelid = val.modelid
						g_lamps[k].reachable = val.state.reachable or false
					else
						g_lamps[k] = {}
						g_lamps[k].manufacturer = manufacturer
						g_lamps[k].hueid = key
						g_lamps[k].on = val.state.on
						g_lamps[k].bri = val.state.bri or 0
						if val.state.hue then g_lamps[k].hue = val.state.hue or 0 end
						if val.state.sat then g_lamps[k].sat = val.state.sat or 0 end
						if val.state.xy[1] then g_lamps[k].x = val.state.xy[1] or 0 end
						if val.state.xy[2] then g_lamps[k].y = val.state.xy[2] or 0 end
						if val.state.ct then g_lamps[k].ct = val.state.ct or 0 end
						if val.state.colormode then g_lamps[k].colormode = val.state.colormode or "hs" end
						if val.state.effect then g_lamps[k].effect = val.state.effect or "none" end
						g_lamps[k].huetype = val.type
						g_lamps[k].name = val.name
						g_lamps[k].modelid = val.modelid
						g_lamps[k].uniqueid = val.uniqueid
						g_lamps[k].swversion = val.swversion
					end
				elseif manufacturer == "cree" or manufacturer == "ge_appliances" or manufacturer == "innr" then
					if val.type == "Dimmable light" then
						g_lamps[k] = {}
						g_lamps[k].manufacturer = manufacturer
						g_lamps[k].hueid = key
						g_lamps[k].on = val.state.on
						g_lamps[k].bri = val.state.bri or 0
						g_lamps[k].huetype = val.type
						g_lamps[k].name = val.name
						g_lamps[k].modelid = val.modelid
						g_lamps[k].reachable = val.state.reachable or false
					else
						g_lamps[k] = {}
						g_lamps[k].manufacturer = manufacturer
						g_lamps[k].hueid = key
						g_lamps[k].on = val.state.on
						g_lamps[k].bri = val.state.bri or 0
						if val.state.hue then g_lamps[k].hue = val.state.hue or 0 end
						if val.state.sat then g_lamps[k].sat = val.state.sat or 0 end
						if val.state.xy[1] then g_lamps[k].x = val.state.xy[1] or 0 end
						if val.state.xy[2] then g_lamps[k].y = val.state.xy[2] or 0 end
						if val.state.ct then g_lamps[k].ct = val.state.ct or 0 end
						if val.state.colormode then g_lamps[k].colormode = val.state.colormode or "hs" end
						if val.state.effect then g_lamps[k].effect = val.state.effect or "none" end
						g_lamps[k].huetype = val.type
						g_lamps[k].name = val.name
						g_lamps[k].modelid = val.modelid
						g_lamps[k].uniqueid = val.uniqueid
						g_lamps[k].swversion = val.swversion
					end
				elseif manufacturer == "osram" then
					if val.type == "Color temperature light" then
						g_lamps[k] = {}
						g_lamps[k].manufacturer = manufacturer
						g_lamps[k].hueid = key
						g_lamps[k].on = val.state.on
						g_lamps[k].bri = val.state.bri or 0
						if val.state.ct then g_lamps[k].ct = val.state.ct or 0 end
						g_lamps[k].huetype = val.type
						g_lamps[k].name = val.name
						g_lamps[k].modelid = val.modelid
						g_lamps[k].reachable = val.state.reachable or false
					else
						g_lamps[k] = {}
						g_lamps[k].manufacturer = manufacturer
						g_lamps[k].hueid = key
						g_lamps[k].on = val.state.on
						g_lamps[k].bri = val.state.bri or 0
						if val.state.hue then g_lamps[k].hue = val.state.hue or 0 end
						if val.state.sat then g_lamps[k].sat = val.state.sat or 0 end
						if val.state.xy[1] then g_lamps[k].x = val.state.xy[1] or 0 end
						if val.state.xy[2] then g_lamps[k].y = val.state.xy[2] or 0 end
						if val.state.ct then g_lamps[k].ct = val.state.ct or 0 end
						if val.state.colormode then g_lamps[k].colormode = val.state.colormode or "hs" end
						if val.state.effect then g_lamps[k].effect = val.state.effect or "none" end
						g_lamps[k].huetype = val.type
						g_lamps[k].name = val.name
						g_lamps[k].modelid = val.modelid
						g_lamps[k].uniqueid = val.uniqueid
						g_lamps[k].swversion = val.swversion
					end
				elseif tostring(val.manufacturername) == "dresden elektronik" then
					g_lamps[k] = {}
					g_lamps[k].manufacturer = val.manufacturername
					g_lamps[k].hueid = key
					g_lamps[k].on = val.state.on
					g_lamps[k].bri = val.state.bri or 0
					g_lamps[k].huetype = val.type
					g_lamps[k].name = val.name
					g_lamps[k].modelid = val.modelid
					g_lamps[k].reachable = val.state.reachable or false
					if val.type == "Color temperature light" then
						if val.state.ct then g_lamps[k].ct = val.state.ct or 0 end
					elseif val.type == "Dimmable light" then
						--
					else
						if val.state.hue then g_lamps[k].hue = val.state.hue or 0 end
						if val.state.sat then g_lamps[k].sat = val.state.sat or 0 end
						if val.state.xy[1] then g_lamps[k].x = val.state.xy[1] or 0 end
						if val.state.xy[2] then g_lamps[k].y = val.state.xy[2] or 0 end
						if val.state.ct then g_lamps[k].ct = val.state.ct or 0 end
						if val.state.colormode then g_lamps[k].colormode = val.state.colormode or "hs" end
						if val.state.effect then g_lamps[k].effect = val.state.effect or "none" end
					end
				else
					debug("(getDevices) : unknown bulb : manufacturername = [" .. tostring(val.manufacturername) .. "] - type = [" .. tostring(val.type) .. "]")
					g_lamps[k] = {}
					g_lamps[k].manufacturer = manufacturer
					g_lamps[k].hueid = key
					g_lamps[k].huetype = val.type
					g_lamps[k].name = val.name
					g_lamps[k].modelid = val.modelid
				end
			end
			debug("(getDevices) : Lights values saved!")
		else
			debug("(getDevices) : There are no lights set on the Bridge!")
		end
	else
		debug("(getDevices) : Possible error, 'lights' tag is not there!")
	end
	-- Get Groups Info
	length = 0
	if json.groups then
		length = getLength(json.groups)
		if length > 0 then
			g_groupNumber = length
			for key, val in pairs(json.groups) do
				if val.type and val.type == "Luminaire" then
					local k = tonumber(key)
					g_groups[k] = {}
					g_groups[k].lights = {}
					g_groups[k].hueid = key
					g_groups[k].name = val.name
					for i = 1,getLength(val.lights) do
						g_groups[k].lights[i] = val.lights[i]
					end
					g_groups[k].huetype = val.type
					if val.modelid then g_groups[k].modelid = val.modelid end
					g_groups[k].on = val.action.on
					g_groups[k].bri = val.action.bri or 0
					if val.action.hue then g_groups[k].hue = val.action.hue or 0 end
					if val.action.sat then g_groups[k].sat = val.action.sat or 0 end
					if val.action.xy then g_groups[k].x = val.action.xy[1] end
					if val.action.xy then g_groups[k].y = val.action.xy[2] end
					if val.action.effect then g_groups[k].effect = val.action.effect or "none" end
					if val.action.ct then g_groups[k].ct = val.action.ct or 0 end
					if val.action.alert then g_groups[k].alert = val.action.alert or "none" end
					if val.action.colormode then g_groups[k].colormode = val.action.colormode or "hs" end
					--if val.state.effect then g_lamps[k].effect = val.state.effect or "none" end
				end
			end
			if #g_groups > 0 then
				debug("(getDevices) : Groups values saved!")
			end
		else
			debug("(getDevices) : There are no groups set on the Bridge!")
		end
	else
		debug("(getDevices) : Possible error, 'groups' tag is not there!")
	end
	-- Get Scenes Info
	local bridgeScenes = {}
	length = 0
	if json.scenes then
		length = getLength(json.scenes)
		if length > 0 then
			g_sceneNumber = length
			for key, val in pairs(json.scenes) do
				local k = key
				g_scenes[k] = {}
				g_scenes[k].sceneID = key
				g_scenes[k].lights = {}
				g_scenes[k].name = val.name
				for i = 1,getLength(val.lights) do
					g_scenes[k].lights[i] = val.lights[i]
				end
				g_scenes[k].active = val.active
				g_scenes[k].version = val.version or 1
				-- update scenes json for web and mobile
				bridgeScenes[k] = {}
				bridgeScenes[k].name = val.name:match("(.+)%s+o[nf]+ %d*") or val.name:match("(.+)")
				bridgeScenes[k].lights = {}
				for i = 1,getLength(val.lights) do
					bridgeScenes[k].lights[i] = val.lights[i]
				end
				bridgeScenes[k].active = val.active
				bridgeScenes[k].version = val.version or 1
			end
			debug("(getDevices) : Scenes values saved!")
		else
			debug("(getDevices) : There are no Scenes set on the Bridge!")
		end
	else
		debug("(getDevices) : Possible error, 'scenes' tag is not there!")
	end
	local scenejson = dkjson.encode(bridgeScenes)
	luup.variable_set(SID.HUE, "BridgeScenes", scenejson, lug_device)
	luup.variable_set(SID.HUE, "BridgeFWVersion", json.config.apiversion or "unknown", lug_device)
	luup.variable_set(SID.HUE, "BridgeModel", json.config.modelid or "unknown", lug_device)
end

function pollHueDevice(pollType)
	local onLightsNumber = 0
	if pollType == "true" then
		debug("(pollHueDevice) : Action poll performed!")
	else
		debug("(pollHueDevice) : Normal poll performed!")
	end
	local length = 0
	local url = generateHueURL() .. "/" .. g_username
	local body, status, headers = http.request(url)
	if status == 200 then
		-- bridge failed status report is alwasy on. Bulbs failed status report is determin based on the value set by users
		local getFailedStatus = luup.variable_get("urn:micasaverde-com:serviceId:HaDevice1", "CommFailure", lug_device) or ""
		if getFailedStatus == "1" then
			luup.set_failure(0, lug_device)
			luup.variable_set(SID.HUE, "Status",GET_LANG("philips_hue_2_connected", "Philips Hue Connected!") , lug_device)
			luup.variable_set(SID.HUE, "BridgeLink", "1" , lug_device)
			displayMessage(GET_LANG("philips_hue_2_connected", "Philips Hue Connected!"), TASK.BUSY)
			for k,v in pairs(g_lamps) do
				if v.veraid then
					luup.set_failure(0, v.veraid)
				end
			end
			for k,v in pairs(g_groups) do
				if v.veraid then
					luup.set_failure(0, v.veraid)
				end
			end
			--luup.reload()
		end
		local thisStatus = {}
		--debug("(pollHueDevice) : BRIDGE JSON = [" .. tostring(body) .. "]")
		local json = dkjson.decode(body)

		if json.lights then
			length = getLength(json.lights)
			if length > 0 then
				if g_lampNumber ~= length then
					debug("(pollHueDevice) : Lights number have been changed, reloading engine in order to apply the changes!")
					luup.reload()
				end
				for key, val in pairs(json.lights) do
					if val.type == "Dimmable plug-in unit" then
						local k = tonumber(key)
						thisStatus[k] = {}
						thisStatus[k].hueid = key
						thisStatus[k].on = val.state.on
						thisStatus[k].bri = val.state.bri
						thisStatus[k].reachable = val.state.reachable
						debug("(pollHueDevice) : LW.state.reachable[".. k .. "] = [" .. tostring(val.state.reachable) .. "]")
					elseif val.type == "Color temperature light" then -- Osram CT lights
						local k = tonumber(key)
						thisStatus[k] = {}
						thisStatus[k].hueid = key
						thisStatus[k].on = val.state.on
						thisStatus[k].bri = val.state.bri
						thisStatus[k].reachable = val.state.reachable
						thisStatus[k].colormode = val.state.colormode
						if val.state.ct then thisStatus[k].ct = val.state.ct or 0 end
					else
						local k = tonumber(key)
						thisStatus[k] = {}
						thisStatus[k].hueid = key
						thisStatus[k].on = val.state.on
						thisStatus[k].bri = val.state.bri
						thisStatus[k].reachable = val.state.reachable
						debug("(pollHueDevice) : lights.state.reachable[".. k .. "] = [" .. tostring(val.state.reachable) .. "]")
						if val.type ~= "Dimmable light" then
							thisStatus[k].hue = val.state.hue
							thisStatus[k].sat = val.state.sat
							thisStatus[k].x = val.state.xy[1]
							thisStatus[k].y = val.state.xy[2]
							if val.state.ct then thisStatus[k].ct = val.state.ct or 0 end
							thisStatus[k].colormode = val.state.colormode
							thisStatus[k].effect = val.state.effect or "none"
						end
					end
				end
			else
				luup.variable_set(SID.HUE, "BridgeFavoriteScenes", "", lug_device)
				luup.variable_set(SID.HUE, "ActionListScenes", "", lug_device)
				luup.variable_set(SID.HUE, "HuePresetTriggers", "", lug_device)
				luup.variable_set(SID.HUE, "BridgeLights", "", lug_device)
				g_lampNumber = 0
				debug("(pollHueDevice) : Polling the Bridge Device : There are no lights set on the Bridge!")
			end
		else
			debug("(pollHueDevice) : Polling the Bridge Device : Possible error, 'lights' tag is not there!")
		end

		for key, val in pairs(thisStatus) do
			if val.hueid == g_lamps[key].hueid then
				if val.type == "Dimmable light" then
					if val.on ~= g_lamps[key].on or val.bri ~= g_lamps[key].bri or val.reachable ~= g_lamps[key].reachable then
						g_lamps[key].on = val.on
						g_lamps[key].bri = val.bri
						g_lamps[key].reachable = val.reachable
					end
				elseif val.type == "Dimmable plug-in unit" then
					if val.on ~= g_lamps[key].on or val.bri ~= g_lamps[key].bri or val.reachable ~= g_lamps[key].reachable then
						g_lamps[key].on = val.on
						g_lamps[key].bri = val.bri
						g_lamps[key].reachable = val.reachable
					end
				elseif val.type == "Color temperature light" then
					if val.on ~= g_lamps[key].on or val.bri ~= g_lamps[key].bri or val.reachable ~= g_lamps[key].reachable or val.ct ~= g_lamps[key].ct or val.colormode ~= g_lamps[key].colormode then
						g_lamps[key].on = val.on
						g_lamps[key].bri = val.bri
						g_lamps[key].reachable = val.reachable
						g_lamps[key].ct = val.ct
						g_lamps[key].colormode = val.colormode
					end
				else
					if val.on ~= g_lamps[key].on or val.bri ~= g_lamps[key].bri or val.hue ~= g_lamps[key].hue or val.sat ~= g_lamps[key].sat or val.x ~= g_lamps[key].x or val.y ~= g_lamps[key].y or val.colormode ~= g_lamps[key].colormode or val.reachable ~= g_lamps[key].reachable or val.effect ~= g_lamps[key].effect then
						g_lamps[key].on = val.on
						g_lamps[key].bri = val.bri
						g_lamps[key].hue = val.hue
						g_lamps[key].sat = val.sat
						g_lamps[key].x = val.x
						g_lamps[key].y = val.y
						g_lamps[key].colormode = val.colormode
						g_lamps[key].reachable = val.reachable
						g_lamps[key].effect = val.effect
					end
					if val.type ~= "Color light" then
						if val.ct ~= g_lamps[key].ct then
							g_lamps[key].ct = val.ct
						end
					end
				end
			end
		end

		for key, value in pairs(g_lamps) do
			local lampDimStatus = luup.variable_get(SID.DIM, "LoadLevelStatus", tonumber(value.veraid)) or ""
			if value.on then
				onLightsNumber = onLightsNumber + 1
				if lampDimStatus ~= "" then
					local updateVal = math.floor(value.bri / 254 * 100 + 0.5)
					if value.bri == 1 then
						updateVal = 1
					end
					if updateVal ~= tonumber(lampDimStatus) then
						luup.variable_set(SID.DIM, "LoadLevelStatus", updateVal, tonumber(value.veraid))
						luup.variable_set(SID.DIM, "LoadLevelTarget", updateVal, tonumber(value.veraid))
						luup.variable_set(SID.SWP, "Status", "1", tonumber(value.veraid))
						debug("(pollHueDevice) : Lamp[" .. value.hueid .. "] ON - UI Updated!")
					else
						debug("(pollHueDevice) : Lamp[" .. value.hueid .. "] ON - No UI update needed!")
					end
				else
					local updateVal = math.floor(value.bri / 254 * 100 + 0.5)
					if value.bri == 1 then
						updateVal = 1
					end
					luup.variable_set(SID.DIM, "LoadLevelStatus", updateVal, tonumber(value.veraid))
					luup.variable_set(SID.DIM, "LoadLevelTarget", updateVal, tonumber(value.veraid))
					luup.variable_set(SID.SWP, "Status", "1", tonumber(value.veraid))
					debug("(pollHueDevice) : Lamp[" .. value.hueid .. "] ON - UI Updated!")
				end
			else
				if lampDimStatus == "" then
					luup.variable_set(SID.DIM, "LoadLevelStatus", "0", tonumber(value.veraid))
					luup.variable_set(SID.DIM, "LoadLevelTarget", "0", tonumber(value.veraid))
					luup.variable_set(SID.SWP, "Status", "0", tonumber(value.veraid))
					debug("(pollHueDevice) : Lamp[" .. value.hueid .. "] OFF - UI Updated!")
				elseif lampDimStatus ~= "0" then
					debug("(pollHueDevice) : Lamp[" .. value.hueid .. "] OFF - Value set to 0!")
					luup.variable_set(SID.DIM, "LoadLevelStatus", "0", tonumber(value.veraid))
					luup.variable_set(SID.DIM, "LoadLevelTarget", "0", tonumber(value.veraid))
					luup.variable_set(SID.SWP, "Status", "0", tonumber(value.veraid))
					debug("(pollHueDevice) : Lamp[" .. value.hueid .. "] OFF - UI Updated!")
				else
					debug("(pollHueDevice) : Lamp[" .. value.hueid .. "] OFF - No UI update needed!")
				end
			end

			if value.huetype ~= "Dimmable light" and value.huetype ~= "Dimmable plug-in unit" then
				local iconColorOnLamp = luup.variable_get(SID.HUE, "IconValue", value.veraid) or ""
				local LampValuesOnLamp = luup.variable_get(SID.HUE, "LampValues", value.veraid) or ""
				local iconNow
				local hue,sat,ct
				local LampValuesNow
				local LampHexValueNow
				if value.colormode == "hs" or value.colormode == "xy" then
					iconNow = getIconVal(value.colormode, value.hue)
					LampValuesNow = "hue:".. value.hue .. ";sat:" .. value.sat
					LampHexValueNow = convertHslToHex(value.hue,value.sat)
				else
					iconNow = getIconVal(value.colormode, value.ct)
					LampValuesNow = "ct:" .. value.ct
					LampHexValueNow = convertColorTemperatureToHex(value.ct)
				end
				if iconColorOnLamp ~= iconNow then
					luup.variable_set(SID.HUE, "IconValue", iconNow, value.veraid)
				end
				if LampValuesOnLamp ~= LampValuesNow then
					luup.variable_set(SID.HUE, "LampValues", LampValuesNow, value.veraid)
					luup.variable_set(SID.HUE, "LampHexValue", LampHexValueNow, value.veraid)
				end
				-- update LampEffect variable
				local effectOnLamp = luup.variable_get(SID.HUE, "LampEffectValue", value.veraid) or ""
				if value.effect and value.effect ~= effectOnLamp then
					luup.variable_set(SID.HUE, "LampEffectValue", value.effect, value.veraid)
				end
			end
			-- update lamp failure
			if FAILED_STATUS_REPORT then
				local getLampFailedStatus = luup.variable_get("urn:micasaverde-com:serviceId:HaDevice1", "CommFailure", value.veraid) or ""
				if value.reachable then
					if getLampFailedStatus ~= "0" then
						luup.set_failure(0, value.veraid)
					end
				else
					if getLampFailedStatus ~= "1" then
						luup.set_failure(1, value.veraid)
					end
				end
			end
		end

		-- update AllOn/Off button status
		local stateAll = luup.variable_get(SID.HUE, "StateForAll", lug_device) or "0"
		if onLightsNumber > 0 then
			if stateAll == "0" then
				luup.variable_set(SID.HUE, "StateForAll", "1", lug_device)
			end
		else
			if stateAll == "1" then
				luup.variable_set(SID.HUE, "StateForAll", "0", lug_device)
			end
		end
		thisStatus = {}
		if #g_groups > 0 then
			if json.groups then
				if getLength(json.groups) > 0 then
					for key, val in pairs(json.groups) do
						if val.type == "Luminaire" then
							local k = tonumber(key)
							thisStatus[k] = {}
							thisStatus[k].lights = {}
							thisStatus[k].hueid = key
							thisStatus[k].name = val.name
							for i = 1,getLength(val.lights) do
								thisStatus[k].lights[i] = val.lights[i]
							end
							thisStatus[k].huetype = val.type
							thisStatus[k].on = val.action.on
							thisStatus[k].bri = val.action.bri or 0
							thisStatus[k].hue = val.action.hue or 0
							thisStatus[k].sat = val.action.sat or 0
							if val.action.xy then thisStatus[k].x = val.action.xy[1] end
							if val.action.xy then thisStatus[k].y = val.action.xy[2] end
							thisStatus[k].ct = val.action.ct or 0
							thisStatus[k].alert = val.action.alert or "none"
							thisStatus[k].colormode = val.action.colormode or "hs"
							thisStatus[k].effect = val.action.effect or "none"
						end
					end
				else
					debug("(pollHueDevice) : Polling the Bridge Device : There are no groups set on the Bridge!")
				end
			else
				debug("(pollHueDevice) : Polling the Bridge Device : Possible error, 'groups' tag is not there!")
			end

			for key, val in pairs(thisStatus) do
				if val.hueid == g_groups[key].hueid then
					if val.on ~= g_groups[key].on or val.bri ~= g_groups[key].bri or val.hue ~= g_groups[key].hue or val.sat ~= g_groups[key].sat or val.x ~= g_groups[key].x or val.y ~= g_groups[key].y or val.ct ~= g_groups[key].ct or val.colormode ~= g_groups[key].colormode or val.effect ~= g_groups[key].effect then
						g_groups[key].on = val.on
						g_groups[key].bri = val.bri
						g_groups[key].hue = val.hue
						g_groups[key].sat = val.sat
						g_groups[key].x = val.x
						g_groups[key].y = val.y
						g_groups[key].ct = val.ct
						g_groups[key].colormode = val.colormode
						g_groups[key].effect = val.effect
					end
				end
			end

			for key, value in pairs(g_groups) do
				local lampDimStatus = luup.variable_get(SID.DIM, "LoadLevelStatus", tonumber(value.veraid)) or ""
				if value.on then
					if lampDimStatus ~= "" then
						local updateVal = math.floor(value.bri / 254 * 100 + 0.5)
						if value.bri == 1 then
							updateVal = 1
						end
						if updateVal ~= tonumber(lampDimStatus) then
							luup.variable_set(SID.DIM, "LoadLevelStatus", updateVal, tonumber(value.veraid))
							luup.variable_set(SID.DIM, "LoadLevelTarget", updateVal, tonumber(value.veraid))
							luup.variable_set(SID.SWP, "Status", "1", tonumber(value.veraid))
						else
							debug("(pollHueDevice) : Group[" .. value.hueid .. "] ON - No UI update needed!")
						end
					else
						local updateVal = math.floor(value.bri / 254 * 100 + 0.5)
						if value.bri == 1 then
							updateVal = 1
						end
						luup.variable_set(SID.DIM, "LoadLevelStatus", updateVal, tonumber(value.veraid))
						luup.variable_set(SID.DIM, "LoadLevelTarget", updateVal, tonumber(value.veraid))
						luup.variable_set(SID.SWP, "Status", "1", tonumber(value.veraid))
					end
				else
					if lampDimStatus == "" then
						luup.variable_set(SID.DIM, "LoadLevelStatus", "0", tonumber(value.veraid))
						luup.variable_set(SID.DIM, "LoadLevelTarget", "0", tonumber(value.veraid))
						luup.variable_set(SID.SWP, "Status", "0", tonumber(value.veraid))
					elseif lampDimStatus ~= "0" then
						debug("(pollHueDevice) : Group[" .. value.hueid .. "] OFF - Value set to 0!")
						luup.variable_set(SID.DIM, "LoadLevelStatus", "0", tonumber(value.veraid))
						luup.variable_set(SID.DIM, "LoadLevelTarget", "0", tonumber(value.veraid))
						luup.variable_set(SID.SWP, "Status", "0", tonumber(value.veraid))
					else
						debug("(pollHueDevice) : Group[" .. value.hueid .. "] OFF - No UI update needed!")
					end
				end
				local iconColorOnLamp = luup.variable_get(SID.HUE, "IconValue", value.veraid) or ""
				local LampValuesOnLamp = luup.variable_get(SID.HUE, "LampValues", value.veraid) or ""
				local iconNow
				local hue,sat,ct
				local LampValuesNow
				local LampHexValueNow
				if value.colormode == "hs" or value.colormode == "xy" then
					iconNow = getIconVal(value.colormode, value.hue)
					LampValuesNow = "hue:".. value.hue .. ";sat:" .. value.sat
					LampHexValueNow = convertHslToHex(value.hue, value.sat)
				else
					iconNow = getIconVal(value.colormode, value.ct)
					LampValuesNow = "ct:" .. value.ct
					LampHexValueNow = convertColorTemperatureToHex(value.ct)
				end
				if iconColorOnLamp ~= iconNow then
					luup.variable_set(SID.HUE, "IconValue", iconNow, value.veraid)
				end
				if LampValuesOnLamp ~= LampValuesNow then
					luup.variable_set(SID.HUE, "LampValues", LampValuesNow, value.veraid)
					luup.variable_set(SID.HUE, "LampHexValue", LampHexValueNow, value.veraid)
				end
				-- update LampEffect variable
				local effectOnLamp = luup.variable_get(SID.HUE, "LampEffectValue", value.veraid) or ""
				if value.effect ~= effectOnLamp then
					luup.variable_set(SID.HUE, "LampEffectValue", value.effect, value.veraid)
				end
			end
		end
		length = 0
		if json.scenes then
			length = getLength(json.scenes)
			if length > 0 then
				if g_sceneNumber ~= length then
					debug("(pollHueDevice) : Hue Presets number have been changed, reloading engine in order to apply the changes!")
					luup.reload()
				end
			else
				if g_sceneNumber ~= 0 then
					debug("(pollHueDevice) : There are no Hue Presets, reloading engine in order to apply the changes!")
					luup.reload()
				end
			end
		end

		if pollType == "false" then
			luup.call_delay( "pollHueDevice", POLLING_RATE , pollType)
		end
		return true
	else
		--TODO add new ip check here
		local getFailedStatus = luup.variable_get("urn:micasaverde-com:serviceId:HaDevice1", "CommFailure", lug_device) or ""
		if getFailedStatus ~= "1" then
			luup.set_failure(1, lug_device)
			debug("(pollHueDevice) : BRIDGE CommFailure status set to 1")
			luup.variable_set(SID.HUE, "Status", GET_LANG("philips_hue_2_disconnected", "Philips Hue Disconnected!") , lug_device)
			luup.variable_set(SID.HUE, "BridgeLink", "0" , lug_device)
			displayMessage(GET_LANG("philips_hue_2_disconnected", "Philips Hue Disconnected!"), TASK.ERROR_STOP)
			--set all hue lamps as failed
			for k,v in pairs(g_lamps) do
				if v.veraid then
					luup.set_failure(1, v.veraid)
				end
			end
			--set all hue groups as failed
			for k,v in pairs(g_groups) do
				if v.veraid then
					luup.set_failure(1, v.veraid)
				end
			end
		end
		if pollType == "false" then
			luup.call_delay( "pollHueDevice", POLLING_RATE , pollType)
			return true
		else
			return false
		end
	end
end

local function checkInitialStatus()
	local url = generateHueURL() .. "/" .. g_username
	http.TIMEOUT = 10
	local body, status, headers = http.request(url)
	if body then
		g_lastState = body
		local json_response = dkjson.decode(body)
		if json_response ~= nil then
			for key, value in pairs(json_response) do
				if value.error ~= nil then
					if value.error.type == 1 or value.error.type == 4 then
						debug( "(checkInitialStatus) : Unregistered user! Proceeding..." )
						bridgeConnect()
						return
					end
				end
			end
			luup.variable_set(SID.HUE, "Status", GET_LANG("philips_hue_2_connected", "Philips Hue Connected!"), lug_device)
			luup.variable_set(SID.HUE, "BridgeLink", "1", lug_device)
			displayMessage(GET_LANG("philips_hue_2_connected", "Philips Hue Connected!"), TASK.BUSY)
			debug( "(checkInitialStatus) : Philips Hue Connected!" )
			g_taskHandle = luup.task(GET_LANG("philips_hue_2_startup_successful", "Startup successful!"), TASK.BUSY, "Hue2 Plugin", g_taskHandle)
			getDevices(json_response)
		end
	else
		local newBridgeIp = PingIpAndCheckMac()
		if newBridgeIp ~= nil and newBridgeIp ~= " " then
			debug("NEW BRIDGE IP IS: "..newBridgeIp.."")
			luup.attr_set("ip", g_ipAddress, lug_device)
			debug("(findBridge) : Found Bridge")
			FLAGS.BRIDGE = false
		else
			luup.variable_set(SID.HUE, "Status", GET_LANG("philips_hue_2_bridge_connection_error", "Connection with the Bridge could not be established! Check IP or the wired connection!"), lug_device)
			luup.variable_set(SID.HUE, "BridgeLink", "0", lug_device)
			displayMessage(GET_LANG("philips_hue_2_bridge_connection_error", "Connection with the Bridge could not be established! Check IP or the wired connection!"), TASK.BUSY)
			debug( "(checkInitialStatus) : Connection with the Bridge could not be established! Check IP or the wired connection!" )
			FLAGS.BRIDGE = false
		end
	end
end

function createGroup(groupName, lightsIDs)
	debug("(createGroup) : groupName = " .. groupName)
	debug("(createGroup) : lightsIDs = " .. lightsIDs)
	local Lights = {}
	for k in lightsIDs:gmatch("(%d+)") do
		table.insert(Lights, k)
	end
	local jsondata = { name = groupName, lights = Lights}
    local postdata = dkjson.encode(jsondata)
    debug("(createGroup) : post data request = " .. postdata)
    local url =  generateHueURL() .. "/" .. g_username .. "/groups"
	local body, status, headers = http.request(url, postdata)
    debug("(createGroup) : result data = " .. body)
    local json_response = dkjson.decode(body)

	local createError = false
    local errorType = 0
    local errorDescription = ""

	for key, value in pairs(json_response) do
		if (value.error ~= nil) then
			createError = true
			errorType = value.error.type
			errorDescription = value.error.description
		end
    end
	if createError then
		debug("(createGroup) : Could not create group! Error Type = " .. errorType .. " ; Description = " .. errorDescription )
		return false
	else
		debug("(createGroup) : Group " .. groupName .. " successfully created!")
		return true
	end
end

function createHueScene(sceneID, name, lights, transitiontime, recycle)
	debug( "(createHueScene) : lights = [" .. tostring(lights) .. "]")
	debug( "(createHueScene) : transitiontime = [" .. tostring(transitiontime) .. "]")
	local data = {}
	local lightsArray = {}
	for k in lights:gmatch("(%d+)") do
		table.insert(lightsArray, k)
	end
	data["name"] = name
	data["lights"] = lightsArray
	data["transitiontime"] = tonumber(transitiontime, 10) or 0
	data["recycle"] = (recycle == "true") and true or false
	debug( "(createHueScene) : recycle = [" .. tostring(recycle) .. "] and type = " .. type(recycle))
	local URL = generateHueURL() .. "/" .. g_username .. "/scenes/"
	local senddata = dkjson.encode(data)
	debug( "(createHueScene) : senddata = [" .. tostring(senddata) .. "]")
	local len = string.len(senddata)
    local bodyparts = { }
    local x, status, headers = http.request {
      url = URL,
      headers = {["content-length"] = len},
      source = ltn12.source.string(senddata),
      sink = ltn12.sink.table(bodyparts),
      method = "POST"
    }
    local body = table.concat(bodyparts)
	local json = dkjson.decode(body)

	local flagError = false

	for key, value in pairs(json) do
		if (value.error ~= nil) then
			debug( "(createHueScene) : Creating Scene ERROR occurred : " .. value.error.type .. " with description : " .. value.error.description)
			flagError = true
		end
    end

	if flagError == false then
		debug("(createHueScene) : Successfully created scene! " .. name)
		luup.reload()
		return true
	else
		debug("(createHueScene) : Please check error/s above!")
		return false
	end
end

function deleteHueScene(sceneID)
	local URL = generateHueURL() .. "/" .. g_username .. "/scenes/" .. sceneID
	local bodyparts = { }
    local x, status, headers = http.request {
      url = URL,
      sink = ltn12.sink.table(bodyparts),
      method = "DELETE"
    }
    local body = table.concat(bodyparts)
	local json = dkjson.decode(body)
	local flagError = false
	for key, value in pairs(json) do
		if (value.error ~= nil) then
			debug( "(deleteHueScene) : Delete Scene ERROR occurred : " .. value.error.type .. " with description : " .. value.error.description)
			flagError = true
		end
    end

	if flagError == false then
		debug("(deleteHueScene) : Successfully deleted scene!")
		return true
	else
		debug("(deleteHueScene) : Please check error/s above!")
		return false
	end
end

function getHueScene(sceneID, device)
	local URL = generateHueURL() .. "/" .. g_username .. "/scenes/" .. sceneID
	local bodyparts = { }
    local x, status, headers = http.request {
      url = URL,
      sink = ltn12.sink.table(bodyparts),
      method = "GET"
    }
    local body = table.concat(bodyparts)
	debug("(getHueScene) : body = [" .. body .. "]")
	debug("(getHueScene) : type(body) = [" .. type(body) .. "]")
	local json = dkjson.decode(body)
	debug("(getHueScene) : type(json) = [" .. type(json) .. "]")
	local flagError = false
	-- if json.error then
		-- for key, val in pairs(json) do
			-- debug("(getHueScene) : json[" .. tostring(key) .. "]=[" .. tostring(val) .. "]")
			-- if val.error ~= nil then
				-- debug( "(getHueScene) : Get Scene ERROR occurred : " .. tostring(val.error.type) .. " with description : " .. tostring(val.error.description))
				-- flagError = true
			-- end
		-- end
	-- end
	if flagError == false then
		luup.variable_set(SID.HUE, "GetSceneValues", body, lug_device)
		debug("(getHueScene) : Successfully got scene !")
		return true
	else
		debug("(getHueScene) : Please check error/s above!")
		return false
	end
end

function modifyHueScene(scene,light,data, device)
	local value = scene .. "," .. light
	local body = putToHue(data, value, "Mscene")
	local json = dkjson.decode(body)

	local flagError = false

	for key, value in pairs(json) do
		if (value.error ~= nil) then
			debug( "(modifyHueScene) : Modify Scene ERROR occurred : " .. value.error.type .. " with description : " .. value.error.description)
			flagError = true
		end
    end

	if flagError == false then
		debug("(modifyHueScene) : Successfully modifyed scene!")
		return true
	else
		debug("(modifyHueScene) : Please check error/s above!")
		return false
	end
end

function modifyHueScene2(scene,light,data, device)
	local value = scene .. "," .. light
	local body = putToHue(data, value, "lightstates")
	local json = dkjson.decode(body)
	local flagError = false

	for key, value in pairs(json) do
		if (value.error ~= nil) then
			debug( "(modifyHueScene2) : Modify Scene V2 ERROR occurred : " .. value.error.type .. " with description : " .. value.error.description)
			flagError = true
		end
    end

	if flagError == false then
		debug("(modifyHueScene2) : Successfully modifyed scene V2!")
		return true
	else
		debug("(modifyHueScene2) : Please check error/s above!")
		return false
	end
end

function modifyHueSceneNameLights(scene, name, lights, device)
	local data = {}
	local lightsArray = {}
	for k in lights:gmatch("(%d+)") do
		table.insert(lightsArray, k)
	end
	data["name"] = name
	data["lights"] = lightsArray
	local senddata = dkjson.encode(data)
	local body = putToHue(senddata, scene, "scene")
	local json = dkjson.decode(body)
	local flagError = false

	for key, value in pairs(json) do
		if (value.error ~= nil) then
			debug( "(modifyHueScene) : Modify Scene Name/Lights ERROR occurred : " .. value.error.type .. " with description : " .. value.error.description)
			flagError = true
		end
    end

	if flagError == false then
		debug("(modifyHueScene) : Successfully modifyed scene name/lights!")
		return true
	else
		debug("(modifyHueScene) : Please check error/s above!")
		return false
	end
end

function runHueScene(sceneID)
	debug("(runHueScene) : Running scene " .. sceneID)

	local finalSceneId = ""
	
	for k,v in pairs(g_scenes) do
		if g_scenes[k].sceneID == sceneID then
			finalSceneId = sceneID
			break
		end
		if g_scenes[k].name == sceneID then
			finalSceneId = g_scenes[k].sceneID
		end
	end

	local data = {}
	data["scene"] = finalSceneId
	--data["on"] = true
	local senddata = dkjson.encode(data)
	local body = putToHue(senddata, 0, "group")
	local json = dkjson.decode(body)
	local flagError = false
	for key, value in pairs(json) do
		if (value.error ~= nil) then
			debug( "(runHueScene) : Running Scene ERROR occurred : " .. value.error.type .. " with description : " .. value.error.description)
			flagError = true
		end
    end

	if flagError == false then
		debug("(runHueScene) : Successfully runned scene!")
		luup.variable_set(SID.HUE, "LastHuePreset", finalSceneId, lug_device)
		return true
	else
		debug("(runHueScene) : Please check error/s above!")
		return false
	end
end

local function addFavoritesScenesFirst(device)
	local favoriteScenes = ""
	local actionListScene = ""
	local i = 1
	for k,v in pairs(g_scenes) do
		favoriteScenes = favoriteScenes .. g_scenes[k].sceneID
		local sceneName = g_scenes[k].name:match("(.+)%s+o[nf]+ %d*") or g_scenes[k].name:match("(.+)")
		actionListScene = actionListScene .. g_scenes[k].sceneID ..";" .. sceneName
		if i < 6 then
			favoriteScenes = favoriteScenes .. ","
			actionListScene = actionListScene .. ";"
		else
			break
		end
		i = i + 1
	end
	luup.variable_set(SID.HUE, "BridgeFavoriteScenes", favoriteScenes, device)
	luup.variable_set(SID.HUE, "FirstRun", "0", device)
	debug("(addFavoritesScenesFirst) : Favorite Scenes added on first run!")
end

local function createActionListScenes(device)
	local actionListScene = ""
	local huePresetTriggers = ""
	for k,v in pairs(g_scenes) do
		local sceneName = g_scenes[k].name:match("(.+)%s+o[nf]+ %d+") or g_scenes[k].name:match("(.+)")
		actionListScene = actionListScene .. g_scenes[k].sceneID ..";" .. sceneName .. ";"
		huePresetTriggers = huePresetTriggers .. g_scenes[k].sceneID .."," .. sceneName .. ";"
	end
	local actionListSceneOld = luup.variable_get(SID.HUE, "ActionListScenes", device) or ""
	if actionListScene ~= actionListSceneOld then
		luup.variable_set(SID.HUE, "ActionListScenes", actionListScene, device)
	end
	debug("(createActionListScenes) : Action Scene List created!")
	local huePresetTriggersOld = luup.variable_get(SID.HUE, "HuePresetTriggers", device) or ""
	if huePresetTriggers ~= huePresetTriggersOld then
		luup.variable_set(SID.HUE, "HuePresetTriggers", huePresetTriggers, device)
	end
	debug("(createActionListScenes) : Preset Triggers List created!")
end

local function setHueDevicesVariables()
	local bridgeLights = ""
	for key,value in pairs(g_lamps) do
		bridgeLights = bridgeLights .. g_lamps[key].hueid .. "," .. g_lamps[key].name .. ";"
	end
	bridgeLights = bridgeLights:sub(1,#bridgeLights -1)
	local bridgeLightsNow = luup.variable_get(SID.HUE, "BridgeLights", lug_device) or ""
	if bridgeLights ~= bridgeLightsNow then
		luup.variable_set(SID.HUE, "BridgeLights", bridgeLights, lug_device)
	end

	for key,value in pairs(g_groups) do
		local groupLights = getGroupLights(value.hueid)
		local groupLightsNow = luup.variable_get(SID.HUE, "GroupLights", value.veraid) or ""
		if groupLights ~= groupLightsNow then
			luup.variable_set(SID.HUE, "GroupLights", groupLights, value.veraid)
		end
	end
end

local function getInfos(device)
	luup.variable_set(SID.HUE, "Status", "", device)
	local debugMode = luup.variable_get(SID.HUE, "DebugMode", device) or ""
	if debugMode ~= "" then
		DEBUG_MODE = (debugMode == "1") and true or false
	else
		luup.variable_set(SID.HUE, "DebugMode", (DEBUG_MODE and "1" or "0"), device)
	end
	debug("(getInfos) : Debug mode "..(DEBUG_MODE and "enabled" or "disabled")..".")

	local polling_rate = luup.variable_get(SID.HUE, "POLLING_RATE", device) or ""
	if polling_rate ~= "" then
			POLLING_RATE = tonumber(polling_rate)
		else
			luup.variable_set(SID.HUE, "POLLING_RATE", POLLING_RATE, device)
	end
	debug("(getInfos) : POLLING_RATE = " .. POLLING_RATE )

	lug_skinCRC32 = GetSkinCRC32()

	local failedStatusReport = luup.variable_get(SID.HUE, "FailedStatusReport", device) or ""
	if failedStatusReport ~= "" then
		FAILED_STATUS_REPORT = (failedStatusReport == "1") and true or false
	else
		if lug_skinCRC32 == -1745509393 or lug_skinCRC32 == -631433117 then
			luup.variable_set(SID.HUE, "FailedStatusReport", (FAILED_STATUS_REPORT and "1" or "0"), device)
		else
			luup.variable_set(SID.HUE, "FailedStatusReport", (FAILED_STATUS_REPORT and "0" or "1"), device)
		end
	end
	debug("(getInfos) : Failed Status Report "..(FAILED_STATUS_REPORT and "enabled" or "disabled")..".")

	local bridgeLink = luup.variable_get(SID.HUE, "BridgeLink", device) or ""
	if bridgeLink == "" then
		luup.variable_set(SID.HUE, "BridgeLink", "0", device)
	end

	findBridge()

	local IP = luup.attr_get("ip", device)

	if IP ~= nil then
		g_ipAddress = IP
	end

	if g_ipAddress == nil or g_ipAddress == "" then
		luup.variable_set(SID.HUE, "BridgeLink", "0", lug_device)
		--displayMessage(GET_LANG("philips_hue_2_error_ip", "IP address could not be automatically set! Please add it in IP field and click on 'Save' button!"), TASK.BUSY)
		--luup.variable_set(SID.HUE, "Status", GET_LANG("philips_hue_2_error_ip", "IP address could not be automatically set! Please add it in IP field and click on 'Save' button!"), lug_device)
		return
	else
		FLAGS.BRIDGE = true
		g_username = luup.attr_get("username", lug_device) or ""
		debug("(getInfos) : Philips Hue URL = " .. generateHueURL() )
		checkInitialStatus()
	end
end

function SetBridgeIp(bridgeIP, bypassStartup)
	--get bridge IP that was selected
	--use IP to get MAC Address from philips hue bridge and save it ONLY HERE
	--if successful set config to done so the next time it starts it just checks for an IP change using ID or MAC
	if bypassStartup == nil then
		bypassStartup = "0"
	end
	debug(" Setting bridge IP")
	luup.attr_set("ip",bridgeIP, lug_device)

	local status, content = luup.inet.wget("http://"..bridgeIP.."/api/0000/config")
	if content ~= nil then
		debug(content)
		local data = dkjson.decode(content)
		if data ~= nil then
			debug(data.mac.. " | ".. data.bridgeid)
			luup.variable_set(SID.HUE, "BridgeId", data.bridgeid , lug_device)
			luup.attr_set("mac", string.upper(data.mac), lug_device)
		end
		if bypassStartup == "0" then
			debug("Setting bridge IP Startup Initiated")
			getInfos(lug_device)
		end
	end
end

function CheckInitialBridges()
	-- local content = {}
	-- debug("(CheckInitialBridges) : Startup...")
	-- local  body, code, headers, status = https.request {
		-- method = "GET",
		-- url = "http://www.meethue.com/api/nupnp",
		-- headers = {},
		-- sink = ltn12.sink.table(content)
	-- }
	-- luup.log("Hue2 Plugin Error " .. tostring(body) .. " | " .. tostring(code) .. " | " .. tostring(headers) .. " | " .. tostring(status) )
	-- for k,v in pairs(content) do
		-- luup.log("Hue2 Plugin " .. k .. " | " .. v )
	-- end
	-- content = table.concat(content)
	local status, content = luup.inet.wget("https://www.meethue.com/api/nupnp")
	if content then
		--luup.log("Hue2 Plugin"..content)
		local contentJson = dkjson.decode(content)
		local bridges = ""
		--luup.log("Hue2 Plugin (CheckInitialBridges) : Startup... "..type(contentJson))
		for k,v in pairs(contentJson) do
			bridges = bridges .. "Bridge " .. k .. "," .. v.internalipaddress .. "," .. v.id .. ";"
		end
		luup.variable_set(SID.HUE, "Bridges", bridges, lug_device)
	end
end

function CheckForIPModifications()
	-- local content = {}
	debug("(CheckForIPModifications) : Trying to get IP via NUPNP...")
	-- local  body, code, headers, status = https.request {
		-- method = "GET",
		-- url = "https://www.meethue.com/api/nupnp",
		-- headers = {},
		-- sink = ltn12.sink.table(content)
	-- }
	-- content = table.concat(content)
	local status, content = luup.inet.wget("https://www.meethue.com/api/nupnp")
	local IP = luup.attr_get("ip", lug_device)
	if content then
		local contentJson = dkjson.decode(content)
		local bridges = ""
		for k,v in pairs(contentJson) do
			bridges = bridges .. "Bridge " .. k .. "," .. v.internalipaddress .. "," .. v.id .. ";"
			local bridgeId = luup.variable_get(SID.HUE, "BridgeId", lug_device)
			if bridgeId ~= nil then
				if string.lower(v.id) == string.lower(bridgeId) then
					debug(IP.. " "..v.internalipaddress)
					if IP ~= v.internalipaddress then
						debug("(CheckForIPModifications) : Found new bridge IP..." ..v.internalipaddress)
						IP = v.internalipaddress
					end
					SetBridgeIp(v.internalipaddress, "1")
				end
			end
		end
		luup.variable_set(SID.HUE, "Bridges", bridges, lug_device)
	else
		--no internet
		MAC_ADDRESS = string.lower(luup.attr_get("mac", _device))
		local newBridgeIp = GetIpForMacAddress(lug_device, MAC_ADDRESS)
		if IP ~= newBridgeIp then
			debug("(CheckForIPModifications) : Found new bridge IP..." ..v.internalipaddress)
			IP = newBridgeIp
		end
		SetBridgeIp(newBridgeIp, "1")
	end
	luup.call_delay("CheckForIPModifications", 600)
end

function Init(lul_device)
	lug_device = lul_device
	lug_language = GetLanguage()
	LoadLanguageTokens()
	g_taskHandle = luup.task(GET_LANG("philips_hue_2_starting", "Starting up..."), TASK.ERROR, "Hue2 Plugin", -1)
	CheckInitialBridges()
	getInfos(lug_device)

	debug( "(Startup) : Bridge Flag"..tostring(FLAGS.BRIDGE))
	
	if FLAGS.BRIDGE then
		g_appendPtr = luup.chdev.start(lug_device)
		appendLamps(lug_device)
		appendGroups(lug_device)
		luup.chdev.sync(lug_device, g_appendPtr)
		getChildDevices(lug_device)
		local bridgeLink = luup.variable_get(SID.HUE, "BridgeLink", lug_device) or ""
		if bridgeLink == "1" then
			pollHueDevice("false")
			local firstRun = luup.variable_get(SID.HUE, "FirstRun", lug_device) or ""
			if firstRun == "" or firstRun == "1" then
				addFavoritesScenesFirst(lug_device)
			end
		end
		createActionListScenes(lug_device)
		setHueDevicesVariables()

		--printArray(g_lamps, "Init", "Lamp")

		debug( "(Startup) : Startup successful!" )
		displayMessage(GET_LANG("philips_hue_2_startup_error", "Startup ERROR : Connection with the Bridge could not be established!"), TASK.BUSY)

		luup.set_failure(0, lug_device)
	else
		g_taskHandle = luup.task(GET_LANG("philips_hue_2_startup_error", "Startup ERROR : Connection with the Bridge could not be established!"), TASK.BUSY, "Philips Hue", g_taskHandle)
		debug( "(Startup) : Startup ERROR : Connection with the Bridge could not be established!" )
		luup.set_failure(1, lug_device)
	end

	debug("IP Address: "..g_ipAddress.."")
	luup.call_delay("CheckForIPModifications", 600)
end

function PrepareFirstRunAfterBridgeConnection(_initialIp)
	local firstRun = luup.variable_get(SID.HUE, "First_Run", lug_device)
	if firstRun ~= nil then --
		debug("FIRST RUN: FALSE")
	else
		debug("FIRST RUN: TRUE")
		if _initialIp ~= nil then
			-- local bridgeMacAddress = string.lower(luup.attr_get("mac", _device))
			-- debug("Mac address is: "..bridgeMacAddress.."")
			-- local ipForMacIs = GetIpForMacAddress(lug_device, bridgeMacAddress)
			-- debug("IP FOR MAC: "..bridgeMacAddress.." IS: ")
			luup.variable_set(SID.HUE, "First_Run", "TRUE", lug_device)
		end
	end
end
