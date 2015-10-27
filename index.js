//initiate the client
var oh = Ohmage("/app", "campaign-monitor")

//global error handler. In ohmage 200 means unauthenticated
oh.callback("error", function(msg, code, req){
  (code == 200) ? window.location.replace("/#login") : alert("Error!\n" + msg);
});

$(function(){
	var campaignList = [];
	var currentResponses = {};
  //init page
  oh.user.whoami().done(function(username){
    oh.keepalive();
    oh.campaign.readall({output_format: 'short'}).done(function(campaigns){
      //assume the hash is a valid campaign urn
		  var currentUrn = window.location.hash.substring(1)
		  //make an array of campaign name/urn. someone tell me how to do this better.
 		   $.each(campaigns, function(i, value){
		     campaignList.push({"name": value.name, "urn": i});
		   });
       currentCampaign = _.findWhere(campaignList, {urn: currentUrn})
       if (currentCampaign === undefined){
          alert('No viewable campaigns match. Please go back.')
       } else {
        doEverything(currentCampaign);
       }
		});
  });

  function doEverything(campaignObject){
   var currentCampaign = campaignObject['urn'];
   $("#campaign_name").text(campaignObject['name']);
   if($("#alertBox").is(':visible')){ $("#alertBox").hide(); }
   $("#manage-data-link").attr('href', '/#responsetool/#' + currentCampaign)
   $("#info_title").text($("#campaign_select option:selected").text());
   
   // ~~~ CREATING OUR RESPONSES OBJECT ~~~
   //start with a survey_response/read user-collapsed call, gets all active users
   oh.response.readall({
        campaign_urn: currentCampaign,
        column_list: "urn:ohmage:user:id",
        output_format: "json-rows",
        survey_id_list: "urn:ohmage:special:all",
        user_list: "urn:ohmage:special:all",
        collapse: "true"
   }).done(function(countByUser){
    all_users_dups = [];
    active_users = [];
    user_total = {};
    $.each(countByUser, function(i, value){ //for each user, mark them as active and a user
     all_users_dups.push(value["user"]);
     active_users.push(value["user"]);
     user_total[value["user"]] = value["count"];
    });
    oh.campaign.readall({
      output_format: "long", 
      campaign_urn_list: currentCampaign
    }).done(function(response){ //campaign/read to grab inactive users
     var roles = ["supervisor", "participant", "analyst"];
     for (var i = 0; i < roles.length; i++) {
      var role = roles[i]
      if (response[currentCampaign]["user_role_campaign"][role]){ //for each role, permute list
       for (var j = 0; j < response[currentCampaign]["user_role_campaign"][role].length; j++) {
        var curUser = response[currentCampaign]["user_role_campaign"][role][j]
        if (includeUser(curUser)){
         all_users_dups.push(curUser);
        }
       }
      }
     }
    all_users = _.uniq(all_users_dups);
    if (all_users.length === 0){ //if still no users, catch and stop
     $("#alertBox").fadeIn();	
     $("#generated-content").hide();
     $("#info_text").hide();
     $("#campaign_select").val("Select a campaign");
    }else{
     oh.user.read({
      user_list: all_users.toString()
     }).done(function(response){ //user/read for personal info
      all_user_info = response;
      oh.response.readall({
        campaign_urn: currentCampaign,
        column_list: "urn:ohmage:user:id,urn:ohmage:context:utc_timestamp,urn:ohmage:context:client,urn:ohmage:survey:privacy_state,urn:ohmage:context:location:status",
        output_format: "json-rows",
        survey_id_list: "urn:ohmage:special:all",
        user_list: "urn:ohmage:special:all",       
      }).done(function(currentResponses){
       $.each(currentResponses, function(i, value){
        var user = value['user'];
        value['first_name'] = (((all_user_info||{})[user]||{})["first_name"]||"unknown");
        value['last_name'] = (((all_user_info||{})[user]||{})["last_name"]||"unknown");
        value['activity'] = "active";
        //it doesn't really look like this existed before...but if it didn't...how did this whole thing work??
        value['count'] = 1;
       });
       var inactive_users = _.difference(all_users, active_users); 
       for (var i=0; i < inactive_users.length; i++) { //splice an inactive user line in for each inactive user
        var user = inactive_users[i];
        var first_name = (((all_user_info||{})[user]||{})["first_name"]||"unknown");
        var last_name = (((all_user_info||{})[user]||{})["last_name"]||"unknown");
        currentResponses.splice(0,0,{"count":0,"privacy_state":"private","utc_timestamp":"1970-01-01 00:00:00","user": user, "first_name": first_name, "last_name": last_name, "activity":"inactive", "client": "na", "location_status": "unavailable", "user_total":0});
       };
  		
  // ~~~~ LET'S MAKE SOME CHARTS ~~~~
   //first, format the date like a date
   parseDate = d3.time.format("%Y-%m-%d %X").parse;
    currentResponses.forEach(function(d) {
      d.realdate = parseDate(d.utc_timestamp);
      d.client = alignClientString(d.client);
      if (user_total[d.user]){
       d.user_total = user_total[d.user];
      }else{
       d.user_total = 0;
      }
    });
    buildInfoTable(currentResponses);
   //now on to the real work
   var ndx = crossfilter(currentResponses)
  
    //make activity pie
    activity_pie = dc.pieChart("#activity-pie");
    activityDimension = ndx.dimension(function(d) { return d.activity; });
    activityGroup = activityDimension.group().reduce(
              function (p, d) {
                  if (d.user in p.users) p.users[d.user]++;
                  else {
                      p.users[d.user] = 1;
                      p.userCount++;
                  }
                  return p;
              },
  
              function (p, d) {
                  p.users[d.user]--;
                  if (p.users[d.user] === 0) {
                      delete p.users[d.user];
                      p.userCount--;
                  }
                  return p;
              },
  
              function () {
                  return {
                      userCount: 0,
                      users: {}
                  };
              });
      //and the actual pie
     activity_pie
        .width(180).height(180).radius(80)
        .dimension(activityDimension)
        .group(activityGroup)
        .valueAccessor(function (d) {
            return d.value.userCount; 
        })
        .label(function (d) {
  	return d.key + "(" + d.value.userCount + ")";
        });
   //make privacy_pie
    privacy_pie = dc.pieChart("#privacy-pie");
    privacyDimension = ndx.dimension(function(d) { if (d.count > 0) {return d.privacy_state;} });
    privacyGroup = privacyDimension.group().reduceSum(function(d) {return d.count;});
      //and the actual pie
      privacy_pie
        .width(180).height(180).radius(80)
        .dimension(privacyDimension)
        .group(privacyGroup)
        .colors(d3.scale.ordinal().domain(["shared", "private"])
                                     .range(["#1f77b4", "#ff7f0e"]))
        .colorAccessor(function(d) { return d.key;})
        .label(function (d){
  	return d.key + "(" + d.value + ")";
         });
    
    //make date_chart
    date_chart = dc.barChart("#date-chart");
    dateDimension = ndx.dimension(function(d) {return d3.time.day.floor(d.realdate);});
    dateGroup = dateDimension.group().reduce(
  	function (p,d) {
  	  if (d.count > 0) {
  	    if (d.privacy_state == "shared") {
  	      p.shared += d.count;
  	    }else{
  	      p.private += d.count;
  	    }
  	  }
  	  return p;
  	},
  	function (p,d) {
            if (d.count > 0) {
              if (d.privacy_state == "shared") {
                p.shared -= d.count;
              }else{
                p.private -= d.count;
              }
            }
            return p;
  	},
  	function () {
  	  return { shared: 0, private: 0 };
  	});
     minDate = dateGroup.top(Infinity)[0].key
     maxDate = dateDimension.top(1)[0].realdate;
    var ndays = Math.round((maxDate - minDate) / (24*60*60*1000));
      //and the actual chart
      date_chart
        .width(390).height(200)
        .dimension(dateDimension)
        .group(dateGroup, "Shared")
  	.valueAccessor(function (d) {
  	return d.value["shared"];
  	})
        .stack(dateGroup, "Private", function (d) {
          return d.value["private"];
          })
        .elasticY(true)
        .x(d3.time.scale().domain([minDate, maxDate]).rangeRound([ndays]))
        .centerBar(false)
        .gap(1)
        .brushOn(true)
        .xUnits(d3.time.days);
        date_chart.xAxis().ticks(5);  
   
    //make distribution_chart
      dist_chart = dc.barChart("#dist-chart");
      distDimension = ndx.dimension(function(d) { return d.user_total;} );
      distGroup = distDimension.group().reduce( 
              function (p, d) {
                  if (d.user in p.users) p.users[d.user]++;
                  else {
                      p.users[d.user] = 1;
                      p.userCount++;
                  }
                  return p;
              },
  
              function (p, d) {
                  p.users[d.user]--;
                  if (p.users[d.user] === 0) {
                      delete p.users[d.user];
                      p.userCount--;
                  }
                  return p;
              },
  
              function () {
                  return {
                      userCount: 0,
                      users: {}
                  };
              }).order(function(d) { return d.user_total;});
  	maxResp = distDimension.top(1)[0].user_total;
      //and the actual chart
      dist_chart
        .width(390).height(200)
        .xAxisLabel("Response Count")
        .yAxisLabel("User Count")
        .dimension(distDimension)
        .group(distGroup)
        .valueAccessor(function (d) {
            return d.value.userCount;
        })
        .elasticY(true)
        .centerBar(true)
        .x((d3.scale.linear().domain([-1,((maxResp < 10) ? 10 : maxResp+1)])))
        .gap(1)
        .brushOn(true)
  
    //make client string user pie
      client_pie_user = dc.pieChart("#client-pie-user");
      clientDimension = ndx.dimension(function(d) { return d.client;} );
      clientGroupUser = clientDimension.group().reduce(
              function (p, d) {
                  if (d.user in p.users) p.users[d.user]++;
                  else {
                     if (d.client != "na"){
                      p.users[d.user] = 1;
                      p.userCount++;
                     }
                  }
                  return p;
              },
  
              function (p, d) {
                  p.users[d.user]--;
                  if (p.users[d.user] === 0) {
                      delete p.users[d.user];
                      p.userCount--;
                  }
                  return p;
              },
  
              function () {
                  return {
                      userCount: 0,
                      users: {}
                  };
              });
  
      //and the actual chart
      client_pie_user
        .width(180).height(180).radius(80)
        .dimension(clientDimension)
        .group(clientGroupUser)
        .valueAccessor(function (d) {
            return d.value.userCount;
        })
        .label(function (d) {
          return d.key + "(" + d.value.userCount + ")";
        });
  
   //make client string response pie
      client_pie_resp = dc.pieChart("#client-pie-resp");
      clientDimension = ndx.dimension(function(d) { return d.client;} );
      clientGroupResp = clientDimension.group().reduceSum(function(d) {return d.count;} );
  
      //and the actual pie
      client_pie_resp
        .width(180).height(180).radius(80)
        .dimension(clientDimension)
        .group(clientGroupResp)
        .label(function (d) {
          return d.key + "(" + d.value + ")";
        });
    
  //make user table, this one is kinda big..
      //first, let's make a dimension to control the table contents.
      usertableDimension = ndx.dimension(function(d) { return d.activity;} );
      usertableGroup = usertableDimension.group().reduce(
        function (p, d) {
  		    if (d.user in p.users) {
                        p.users[d.user]["count"]++;
  		      if (d.count > 0) {
  		        p.users[d.user]["total"]++;
  		        if (d.privacy_state == "shared"){
  		    	    p.users[d.user]["shared"]++;
  		        }else{
  		    	    p.users[d.user]["private"]++;
  		        }
  		      }
          }else{
  		      p.users[d.user] = {};
  		      p.users[d.user]["first_name"] = d.first_name;
  		      p.users[d.user]["last_name"] = d.last_name;
  		      p.users[d.user]["count"] = 1;
  		      p.users[d.user]["total"] = 0;
            p.users[d.user]["shared"] = 0;
            p.users[d.user]["private"] = 0;
  		      if (d.count > 0) {
              p.users[d.user]["total"] = 1;
  		        if (d.privacy_state == "shared"){
                p.users[d.user]["shared"] = 1;
              }else{
                p.users[d.user]["private"] = 1;
              }
  		      }
  		    }
          return p;
        },
            function (p, d) {
  		p.users[d.user]["count"]--;
  		if (p.users[d.user]["count"] > 0) {
  		  p.users[d.user]["total"]--;
  		 if (d.privacy_state == "shared"){
  		  p.users[d.user]["shared"]--;
  		 }else{
  		  p.users[d.user]["private"]--;
  		 }
  		}
  		if (p.users[d.user]["count"] === 0) {
  		  delete p.users[d.user];
  		}
  		return p;
            },
            function () {
                  return { users: {}};
            });
       //dyntable doesn't support nested json, so here's my custom writer:
       function nestedAttributeWriter(record) {
        // checks if id is a nested property, finds said property via iteration.
        // `this` is the column object in settings.columns
          if((this.id).indexOf('.') !== -1){
                  var prop, props = (this.id).split('.');
                  for (var i = 0, iLen = props.length - 1; i < iLen; i++) {
                    prop = props[i];
                    var candidate = record[prop];
                    if (candidate !== undefined) {
                      record = candidate;
                    } else {
                          break;
                    }
                  }
           return record[props[i]];
          } else {
           return record[this.id];
          }
        };
       //
  	var table_data = [];
  		$.each(usertableGroup.top(Infinity)[0].value["users"], function ( index, value ){
  			table_data.push( {"user": index, "first": value["first_name"], "last": value["last_name"], "shared": value["shared"] || 0, "private": value["private"] || 0, "total": value["total"] || 0});
  		});
  		if (usertableGroup.top(Infinity)[1]){
                  $.each(usertableGroup.top(Infinity)[1].value["users"], function ( index, value ){
                          table_data.push( {"user": index, "first": value["first_name"], "last": value["last_name"], "shared": value["shared"] || 0, "private": value["private"] || 0, "total": value["total"] || 0});
                  });
  		}
          var dynatable = $('#user-table').dynatable({
                  features: {
                      pushState: false,
                      paginate: true,
  		    sort: true,
                      recordCount: true
                  },
  		inputs: {
  		    recordCountPlacement: 'before'
  		},
                  dataset: {
                      records: table_data,
  		    sorts: { 'total': -1 },
  		    perPageDefault: 30
                  },
                  writers: {
                      _attributeWriter: nestedAttributeWriter
                  },
  		params: {
  		    records: 'users'
  		}
              }).data('dynatable');
          
          function RefreshTable() {
                  dc.events.trigger(function () {
          var table_data = [];
                  $.each(usertableGroup.top(Infinity)[0].value["users"], function ( index, value ){
                          table_data.push( {"user": index, "first": value["first_name"], "last": value["last_name"], "shared": value["shared"] || 0, "private": value["private"] || 0, "total": value["total"] || 0});
                  });
  		if (usertableGroup.top(Infinity)[1]){
                  $.each(usertableGroup.top(Infinity)[1].value["users"], function ( index, value ){
                          table_data.push( {"user": index, "first": value["first_name"], "last": value["last_name"], "shared": value["shared"] || 0, "private": value["private"] || 0, "total": value["total"] || 0});
                  });
  		}
                      dynatable.settings.dataset.originalRecords = table_data;
                      dynatable.process();
                  });
  	    togglePersonal();    
              };
           for (var i = 0; i < dc.chartRegistry.list().length; i++) {
                  var chartI = dc.chartRegistry.list()[i];
                  chartI.on("filtered", RefreshTable);
              }
          RefreshTable();
     $("#generated-content").show();
     dc.renderAll();
      }); //end survey_response_read for currentResponses
     }); //end user.read
    };
    }); //end campaign_read.long
   }); //end survey_response_read.user
  }; //end doEverything function
  //generate info table
  function buildInfoTable(responses){
    var userCount = { total:0,active:0,inactive:0,list:[] }
    var responseCount = { total:0,shared:0,private:0 }
    var dateList = []
    var gpsCount = 0;
    responses.forEach(function(d) {
     if (d.activity === "active" && _.indexOf(userCount['list'],d.user) === -1){ userCount['total']++; userCount['active']++; userCount['list'].push(d.user); }
     if (d.activity === "inactive" && _.indexOf(userCount['list'],d.user) === -1){ userCount['total']++; userCount['inactive']++; userCount['list'].push(d.user); }
     if (d.privacy_state === "shared" && d.count === 1) { responseCount['total']++; responseCount['shared']++;  }
     if (d.privacy_state === "private" && d.count === 1) { responseCount['total']++; responseCount['private']++;  }
     if (d.count === 1) { dateList.push(d3.time.day.floor(d.realdate));  }
     if (d.location_status !== "unavailable") { gpsCount++;  }
    });
     var minDate = _.min(dateList);
     var maxDate = _.max(dateList);
     var rangeDate = (maxDate - minDate) /(1000*60*60*24);
     $("#info_text").show();
     $("#info_textResponses").text(responseCount['total']+" responses / "+userCount['total']+" users");
     $("#info_userTotal").text("Total: "+userCount['total']+", Active: "+userCount['active']+" ("+Math.round(userCount['active']/userCount['total']*100)+"%), Inactive: "+userCount['inactive']+" ("+Math.round(userCount['inactive']/userCount['total']*100)+"%)");
     $("#info_responseTotal").text("Total: "+responseCount['total']+", Shared: "+responseCount['shared']+" ("+Math.round(responseCount['shared']/responseCount['total']*100)+"%), Private: "+responseCount['private']+" ("+Math.round(responseCount['private']/responseCount['total']*100)+"%)");
     $("#info_perUser").text(Math.round(responseCount['total']/userCount['active']));
     $("#info_gps").text(gpsCount+" ("+Math.round(gpsCount/responseCount['total']*100)+"% of responses)");
     $("#info_firstDate").text((dateList.length > 0 ? d3.time.format('%b %e, %Y')(minDate) : "N/A"));
     $("#info_lastDate").text((dateList.length > 0 ? d3.time.format('%b %e, %Y')(maxDate) : "N/A"));
     $("#info_totalDate").text((dateList.length > 0 ? rangeDate : "N/A"));
  };
    
  
  // a hack to prevent certain users from displaying on lausd.mobilizingcs.org
  function includeUser(user){
    if (window.location.host !== "lausd.mobilizingcs.org"){
     return true;
    }else{
     if (user.indexOf("mobilize-") !== -1){
  	return false; 
     } else {
    return true;
     } 
    }
  };
  
  //replace client strings with something a user might understand.
  function alignClientString(client){
    switch (client) {
     case 'mobilize-mwf-ios': client = 'iOS'; break;
     case 'mobilize-mwf': client = 'iOS'; break;
     case 'ohmage-mwf': client = 'iOS'; break;
     case 'android': client = 'Android'; break;
     case 'ohmage-android': client = 'Android'; break;
     case 'Mobilize': client = 'Android'; break;
     case 'mobilize-android': client = "Android"; break;
     case 'browser-mwf': client = 'Browser'; break;
    }
    return client;
  };
  
  //show or hide personal data on demand
  $('#hidePersonal').click(function () {
    togglePersonal()
  });
  //keep personal data toggle in sync with pagination
  $('#user-table').bind('dynatable:afterProcess', function(e, data) {
          togglePersonal();
  }); 
  function togglePersonal(){
      if ($("#hidePersonal").is(':checked')) {
      	$("#user-table tr th:nth-child(2)").show(this.checked);
      	$("#user-table tr th:nth-child(3)").show(this.checked);
      	$("#user-table tr td:nth-child(2)").show(this.checked);
      	$('#user-table tr td:nth-child(3)').show(this.checked);
      }else{
          $("#user-table tr th:nth-child(2)").hide(this.checked);
          $("#user-table tr th:nth-child(3)").hide(this.checked);
          $("#user-table tr td:nth-child(2)").hide(this.checked);
          $('#user-table tr td:nth-child(3)').hide(this.checked);
      }
  };
}); //end of index.js-wide function
