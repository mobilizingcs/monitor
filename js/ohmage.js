/*
 * JavaScript client library for Ohmage 2.xx
 * Author: Jeroen Ooms <jeroenooms@gmail.com>
 * License: Apache 2
 */

 // https://github.com/umdjs/umd/blob/master/returnExports.js
 (function (root, factory) {
	if (typeof define === 'function' && define.amd) {
		// AMD (Register as an anonymous module)
		define(['jquery', 'jquery.cookie'], factory);
	} else if (typeof exports === 'object') {
		// Node/CommonJS
		module.exports = factory(require('jquery', 'jquery.cookie'));
	} else {
		// Browser globals
		root.returnExports = factory(jQuery);
	}
}(this, function ($) {

  Ohmage = function(app, client){
  
  	//validate parameters
  	if( ! app || ! client ) {
  		throw "app and client are required parameters.";
  	} else {
  		//remove trailing slash if any
  		app = app.replace(/\/+$/, "");
  	}
  
  	//globals
  	var callbacks = [];
  	var login;
  
  	//container with optional set functions
  	var oh = {}
  
  	oh.callback = function(name, fun){
  		callbacks.push({name:name, fun:fun})
  		return oh;
  	}
  
  	//main ajax function
  	oh.call = function(path, data, datafun){
  
  		//support for multiple errorfuns and chaining
  		var errorfuns = [];
  		function error(x,y,z){
  			//don't call on HTTP 0 (canceled)
  			if(z.status){
  				$.each(errorfuns, function(i, val){
  					val(x,y,z)
  				});
  			}
  		}
  
  		//default is to return res.result.data property
  		var datafun = datafun || function(x){ return x.data; }
  
  		//input processing
  		var data = data || {};
  
  		//default parameter
  		data.client = client;
  
  		//add auth_token from cookie
  		if($.cookie('auth_token')){
  			data.auth_token = $.cookie('auth_token');
  		}
  
  		//ajax parameters
  		var ajaxparams = {
  			type: "POST",
  			url : app + path,
  			data: data,
  			dataType: "text",
  			xhrFields: {
  				withCredentials: true
  			}
  		}
  
  		//ohmage multipart hack
  		if(data instanceof FormData){
  			ajaxparams.contentType = false;
  			ajaxparams.cache = false;
  			ajaxparams.processData = false;
  		}
  
  		//actual ajax
  		var req = $.ajax(ajaxparams).then(function(rsptxt, textStatus, req) {
  			//jQuery doneFilter
  			var filter = $.Deferred()
  
  			//ohmage returns whatever it feels like.
  			if(req.getResponseHeader("content-type") == "application/json"){
  
  				//ohmage content-type cannot be trusted
  				if(!rsptxt || rsptxt == "") {
  					var errorThrown = "Fail: " + path + ". Ohmage returned undefined error."
  					error(errorThrown, -1, req)
  					filter.reject(req, textStatus, errorThrown);
  				}
  
  				//let's assume JSON
  				var response = $.parseJSON(rsptxt);
  
  				//HTTP 200 does not actually mean success
  				if(response.result == "success"){
  					filter.resolve(datafun(response), textStatus, req);
  				} else if(response.result == "failure") {
  					//fail request with error code+msg
  					var errorThrown = response.errors[0].text;
  					error(response.errors[0].text, response.errors[0].code, req)
  					filter.reject(req, textStatus, errorThrown);
  				} else {
  					var msg = "JSON response did not contain result attribute."
  					error(errorThrown, -2, req)
  					filter.reject(req, textStatus, errorThrown);
  				}
  			} else {
  				//case of HTTP 200 but not JSON.
  				filter.resolve(rsptxt, textStatus, req);
  			}
  
  			//return to done() callback
  			return filter.promise();
  		}, function(req, textStatus, errorThrown){
  			//jQuery failFilter
  			var filter = $.Deferred();
  
  			//don't throw error when status == 0 (request canceled)
  			if(req.status){
  				error("HTTP " + req.status + ": " + req.responseText, -3, req)
  			}
  
  			filter.reject(req, textStatus, errorThrown);
  
  			//return to fail() callback
  			return filter.promise();
  		})
  
  		//add the custom 'error' cb
  		req.error = function(fun){
  			//chainable wrapper
  			errorfuns.push(function(x,y,z){
  				fun(x,y,z);
  				return req
  			});
  			return req
  		}
  
  		//trigger global callbacks
  		$.each(callbacks, function(i, val){
  			req[val.name](val.fun);
  		});
  
  		return req
  	}
  
  	//some APIs only support multipart so we need to hack around that
  	oh.callform = function(path, data, datafun){
  		var formdata = new FormData();
  		formdata.append("client", client)
  		formdata.append("auth_token", $.cookie('auth_token'));
  		$.each(data, function(key, value){
  			formdata.append(key, value);
  		});
  		return oh.call(path, formdata, datafun);
  	}
  
  	//API sections
  	oh.config = {};
  	oh.user = {};
  	oh.class = {};
  	oh.campaign = {};
  	oh.document = {};
  	oh.registration = {};
  	oh.audit = {};
  	oh.survey = {};
  	oh.response = {};
  
  	//API wrappres
  	oh.config.read = function(){
  		return oh.call("/config/read")
  	}
  
  	oh.user.whoami = function(){
  		return oh.call("/user/whoami", {}, function(x){return x.username})
  	}
  
  	//@args user
  	//@args password
  	oh.user.auth_token = function(data){
  		return oh.call("/user/auth_token", data, function(x){return x.token});
  	}
  
  	//shorthand for above
  	oh.login = function(user, password){
  		return oh.user.auth_token({
  			user:user,
  			password : password
  		});
  	}
  
  	oh.user.logout = function(){
  		return oh.call("/user/logout");
  	}
  
  	oh.user.info = function(){
  		return oh.call("/user_info/read")
  	}
  
  	//@args user_list
  	oh.user.read = function(data){
  		return oh.call("/user/read", data)
  	}
  
  	//@args class_urn_list
  	//@args first_name
  	//@args last_name
  	//@args organization
  	//@args personal_id
  	oh.user.setup = function(data){
  		return oh.call("/user/setup", data)
  	}
  
  	//@args user
  	//@args password
  	//@args username
  	//@args new_password
  	oh.user.change_password = function(data){
  		return oh.call("/user/change_password", data)
  	}
  
  	//@args username
  	//@args email_address
  	//@note more related to registration apis...
   	oh.user.reset_password = function(data){
   		return oh.call("/user/reset_password", data)
   	}
   
    //@args registration_id
   	oh.user.activate = function(data){
   		return oh.call("/user/activate", data)
   	}
  
   	//@args user_list
   	//@note admin-only api
  	oh.user.delete = function(data){
  		return oh.call("/user/delete", data);
  	}
  
  	//@note api is undocumented.
    //@note admin-only api
  	oh.user.search = function(data){
  		return oh.call("/user/search", data)
  	}
  
    //@args username
    //@args password
    //@args admin
    //@args enabled
    //@args new_account
    //@args campaign_creation_privilege
  	oh.user.create = function(data){
  		return oh.call("/user/create", data)
  	}
  
  	//@args see: https://github.com/ohmage/server/wiki/User-Manipulation#input-parameters-5
  	//@note admin-only api
  	oh.user.update = function(data){
  		return oh.call("/user/update", data)
  	}
  
  
  	//@args class_urn_list
  	oh.class.read = function(data){
  		return oh.call("/class/read", data)
  	}
  
  	//@args class_urn
  	//@args class_name
  	oh.class.create = function(data){
  		return oh.call("/class/create", data)
  	}
  
  	oh.class.delete = function(data){
  		return oh.call("/class/delete", data)
  	}
  
  	oh.class.update = function(data){
  		return oh.call("/class/update", data)
  	}
  
  	//shorthand
  	oh.class.adduser = function(class_urn, username){
  		return oh.class.update({
  			class_urn : class_urn,
  			user_role_list_add : username
  		})
  	}
  
  	//shorthand
  	oh.class.removeuser = function(class_urn, username){
  		return oh.class.update({
  			class_urn : class_urn,
  			user_list_remove : username
  		})
  	}
  
  	//@args class_urn
  	oh.class.search = function(data){
  		return oh.call("/class/search")
  	}
  
  	oh.campaign.read = function(data){
  		//set a default
  		data = data || {};
  		data.output_format = data.output_format || "short";
  		return oh.call("/campaign/read", data, function(x){return x.metadata.items});
  	}
  
  	//@args xml
  	//@args privacy_state
  	//@args running_state
  	//@args campaign_urn
  	//@args campaign_name
  	//@args class_urn_list
  	oh.campaign.create = function(data){
  		return oh.call("/campaign/create", data)
  	}
  
  	oh.campaign.update = function(data){
  		return oh.call("/campaign/update", data)
  	}
  
  	//shorthand
  	oh.campaign.addclass = function(campaign_urn, class_urn){
  		return oh.campaign.update({
  			campaign_urn : campaign_urn,
  			class_list_add : class_urn
  		})
  	}
  
  	//@args campaign_urn
  	oh.campaign.delete = function(data){
  		return oh.call("/campaign/delete", data)
  	}
  
  	//@args campaign_urn
  	//@args description
  	//@args xml
  	//@args authored_by
  	//@args start_date
  	//@args end_date
  	//@args privacy_state
  	//@args running_state
  	//@note admin-only api
   	oh.campaign.search = function(data){
   		return oh.call("/campaign/search", data)
   	}
  
   	oh.campaign.readall = function(data){
   		//set a default
   		data = data || {};
   		data.output_format = data.output_format || "short";
   		return oh.call("/campaign/read", data);
   	}
  
  	//@args document_name
  	//@args privacy_state
  	//@args document_class_role_list
  	//@args document
  	oh.document.create = function(data){
  		return oh.call("/document/create", data, function(x) {return x.document_id})
  	}
  
  	oh.document.read = function(data){
  		return oh.call("/document/read", data)
  	}
  
  	//shorthand for searching
  	oh.document.search = function(filter){
  		return oh.document.read({
  			document_name_search : filter
  		})
  	}
  
  	//@args document_id
  	oh.document.contents = function(data){
  		return oh.call("/document/read/contents", data)
  	}
  
   	//@args document_id
   	oh.document.delete = function(data){
   		return oh.call("/document/delete", data)
   	}
   
   	//@args document_id
   	//@args document_name
   	//@args privacy_state
   	//@args description
   	//@args campaign_role_list_add
   	//@args campaign_role_list_remove
   	//@args class_role_list_add
   	//@args class_role_list_remove
   	oh.document.update = function(data){
   		return oh.call("/document/update", data)
   	}
  
   	oh.registration.read = function(){
   		return oh.call("/registration/read")
   	}
   
   	//@args username
   	//@args password
   	//@args email_address
   	//if ohmage <= 2.16
   	//@args recaptcha_challenge_field
   	//@args recaptcha_response_field
   	//if ohmage >= 2.17
   	//@args recaptcha_version = "2.0"
   	//@args recaptcha_response_field
   	oh.user.register = function(data){
   		return oh.call("/user/register", data)
   	}
  
   	//@args request_type
   	//@args uri
   	//@args client_value
   	//@args device_id_value
   	//@args response_type
   	//@args error_code
   	//@args start_date
   	//@args end_date
   	//@note admin-only api
   	//@note passing no date params will result in all audits return.
   	//      this is a phenomenally bad idea.
  	oh.audit.read = function(data){
  		//ohmage returns audits in this call under the 'audits' object
  		return oh.call("/audit/read", data, function(x){ return x.audits; })
  	}
  
  	oh.survey.count = function(urn){
  		data = {
  			campaign_urn : urn,
  			id : "privacy_state"
  		};
  		return oh.call("/survey_response/function/read", data)
  	}
  
  	oh.response.read = function(urn){
  		return oh.call("/survey_response/read", {
  			campaign_urn : urn,
  			column_list : "urn:ohmage:special:all",
  			output_format : "json-rows",
  			survey_id_list : "urn:ohmage:special:all",
  			user_list : "urn:ohmage:special:all"
  		})
  	}

    oh.response.readall = function(data){
      return oh.call("/survey_response/read", data)
    }
  
  	oh.response.delete = function(urn, survey_key){
  		return oh.call("/survey_response/delete", {
  			campaign_urn : urn,
  			survey_key : survey_key
  		})
  	}
  
  	oh.response.update = function(urn, survey_key, state){
  		return oh.call("/survey_response/update", {
  			campaign_urn : urn,
  			survey_key : survey_key,
  			privacy_state : (state ? "shared" : "private")
  		});
  	}
  
  	//no more than 1 ping every 60 sec
  	oh.ping = debounce(oh.user.whoami, 60*1000, true);
  
  	//ping once every t sec
  	oh.keepalive = once(function(t){
  		t = t || 60;
  		setInterval(oh.ping, t*1000)
  	});
  
  	//or: keep alive only when active
  	oh.keepactive = once(function(t){
  		$('html').click(function() {
  			oh.ping();
  		});
  	});
  
  	// Copied from underscore.js
  	function debounce(func, wait, immediate) {
  		var timeout, args, context, timestamp, result;
  
  		var now = function() {
  			return new Date().getTime();
  		};
  
  		var later = function() {
  			var last = now() - timestamp;
  			if (last < wait) {
  				timeout = setTimeout(later, wait - last);
  			} else {
  				timeout = null;
  				if (!immediate) {
  					result = func.apply(context, args);
  					context = args = null;
  				}
  			}
  		};
  
  		return function() {
  			context = this;
  			args = arguments;
  			timestamp = now();
  			var callNow = immediate && !timeout;
  			if (!timeout) {
  				timeout = setTimeout(later, wait);
  			}
  			if (callNow) {
  				result = func.apply(context, args);
  				context = args = null;
  			}
  
  			return result;
  		};
  	};
  
  	// Copied from underscore.js
  	function once(func) {
  		var ran = false, memo;
  		return function() {
  			if (ran) return memo;
  			ran = true;
  			memo = func.apply(this, arguments);
  			func = null;
  			return memo;
  		};
  	};
  
  	// test run call
  	oh.config.read().done(function(x){
  		console.log("This is Ohmage/" + x.application_name + " " + x.application_version + " (" + x.application_build + ")")
  	}).error(function(msg, code){
  		console.log("Ohmage seems offline: " + msg)
  	});
  
  	return(oh)
  }
}));
