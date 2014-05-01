$(function(){
	var campaignList = [];
	var currentResponses = {};
        //init page
        oh.ping(function(){
            oh.campaign_read(function(campaigns){
		var hash = window.location.hash
		var hashMatch = new String();
		//make an array of campaign name/urn. someone tell me how to do this better.
 		 $.each(campaigns, function(i, value){
		   campaignList.push({"name": value.name, "urn": i});
		 });
		var sortList = _.sortBy(campaignList, function(row){ return row.name.toLowerCase(); });
		$.each(sortList, function(i, v){
		  if (hash === "#"+v.urn) {
			hashMatch = v.urn;
		  }		
		  $("#campaign_select")
		    .append($("<option></option>")
		    .attr("value",v.urn)
		    .text(v.name));
		});
		 $("#campaign_select").removeProp('disabled');
		 //if urn in hash matches, load this campaign, otherwise just ignore it
		 if (hashMatch.length > 0) {
		  $("#campaign_select").val(hashMatch).change();
		 }
		});
                oh.keepalive();
        });

$("#campaign_select").change(function() {
	currentCampaign = $("#campaign_select option:selected").val();
	window.location.hash = currentCampaign;
	oh.campaign_read.long(this.value, function(response){
		all_users_dups = [];
		if (response[currentCampaign]["user_role_campaign"]["participant"]){
			for (var i = 0; i < response[currentCampaign]["user_role_campaign"]["participant"].length; i++) {
			   if (includeUser(response[currentCampaign]["user_role_campaign"]["participant"][i])){
 			   all_users_dups.push(response[currentCampaign]["user_role_campaign"]["participant"][i]);
			   }
			}
		}
                if (response[currentCampaign]["user_role_campaign"]["analyst"]){
                        for (var i = 0; i < response[currentCampaign]["user_role_campaign"]["analyst"].length; i++) {
                           if (includeUser(response[currentCampaign]["user_role_campaign"]["analyst"][i])){
                           all_users_dups.push(response[currentCampaign]["user_role_campaign"]["analyst"][i]);
			   }
			}
                }
                if (response[currentCampaign]["user_role_campaign"]["author"]){
                        for (var i = 0; i < response[currentCampaign]["user_role_campaign"]["author"].length; i++) {
                           if (includeUser(response[currentCampaign]["user_role_campaign"]["author"][i])){
                           all_users_dups.push(response[currentCampaign]["user_role_campaign"]["author"][i]);
			   }
                        }
                }
                if (response[currentCampaign]["user_role_campaign"]["supervisor"]){
                        for (var i = 0; i < response[currentCampaign]["user_role_campaign"]["supervisor"].length; i++) {
                           if (includeUser(response[currentCampaign]["user_role_campaign"]["supervisor"][i])){
                           all_users_dups.push(response[currentCampaign]["user_role_campaign"]["supervisor"][i]);
			   }
                        }
                }
		all_users = _.uniq(all_users_dups);
	    //catch and don't run if campaign has no users/responses
            if (all_users.length === 0){
		alert("This campaign has no users, please select another campaign");
		$("#generated-content").hide();
		$("#surveyCount-p").hide();
		$("#campaign_select").val("Select a campaign");	
	    }else{
		oh.user.read(all_users.toString(), function(response){
			all_user_info = response;
	          oh.survey_response_read(currentCampaign, function(currentResponses){
		 //display count of surveys
		console.log(currentResponses);
		 surveyCount = _.size(currentResponses);
		 $("#surveyCount").text(surveyCount);
		 $("#surveyCount-p").show();
		//add activity state of active to each of these users.
		var active_users = [];
		var user_total = {};
		$.each(currentResponses, function(i, value){
		  var user = value['user'];
			//TODO: make additional user/read calls for folks who are no longer attached to the campaign but have responses
			if (!all_user_info[user]){
			  all_user_info[user] = {"first_name": "unknown","last_name": "unknown"}; 
			}
		  active_users.push(value['user']);
		  value['first_name'] = all_user_info[user]["first_name"] || "unknown";
		  value['last_name'] = all_user_info[user]["last_name"] || "unknown";
		  value['activity'] = "active";
		   //this is weird, but we need to count total responses per user for #distribution_graph below
		   if (isNaN(user_total[user])){
		    user_total[user] = new Number();
		   }
		   user_total[user] += value['count'];
		});
		active_users = _.uniq(active_users);
		var inactive_users = _.difference(all_users, active_users);
		for (var i=0; i < inactive_users.length; i++) {
		 var user = inactive_users[i];
		 currentResponses.splice(0,0,{"count":0,"privacy_state":"private","utc_timestamp":"1970-01-01 00:00:00","user": user, "first_name": all_user_info[user]["first_name"] || "unknown", "last_name": all_user_info[user]["last_name"] || "unknown", "activity":"inactive", "client": "na", "user_total":0});
		};

// ~~~~ LET'S MAKE SOME CHARTS ~~~~
 //first, format the date like a date
 parseDate = d3.time.format("%Y-%m-%d %X").parse;
  currentResponses.forEach(function(d) {
    d.realdate = parseDate(d.utc_timestamp);
    if (user_total[d.user]){
     d.user_total = user_total[d.user];
    }else{
     d.user_total = 0;
    }
  });
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
      .width(270).height(220).radius(80)
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
      .width(270).height(220).radius(80)
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
      .width(500).height(200)
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
      .width(500).height(200)
      .xAxisLabel("Response Count")
      .yAxisLabel("User Count")
      .dimension(distDimension)
      .group(distGroup)
      .valueAccessor(function (d) {
          return d.value.userCount;
      })
      .elasticY(true)
      .centerBar(true)
      .x((d3.scale.linear().domain([-1, maxResp+1])))
      .gap(1)
      .brushOn(true)

  //make client string pie
    client_pie = dc.pieChart("#client-pie");
    clientDimension = ndx.dimension(function(d) { return d.client;} );
    clientGroup = clientDimension.group().reduceSum(function(d) {return d.count;} );

    //and the actual chart
    client_pie
      .width(270).height(220).radius(80)
      .dimension(clientDimension)
      .group(clientGroup);
       //commenting for now, not the way I want to do it.
      //.label(function (d){
	//var cases = {
//	  "mobilize-mwf-ios": s_client = "iOS",
//	  "ohmage-android": s_client = "Android",
//	  "browser-mwf": s_client = "Browser",
//	  "ohmage-mwf": s_client = "iOS",
//	  "android": s_client = "Android"
//        };
//	if (cases[s_client]) {
//	  cases[d.key]();
//	}
//	 return s_client;
//      }); 
      //  return d.key + "(" + d.value + ")";
      // });
  
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
            };
         for (var i = 0; i < dc.chartRegistry.list().length; i++) {
                var chartI = dc.chartRegistry.list()[i];
                chartI.on("filtered", RefreshTable);
            }
        RefreshTable();
   $("#generated-content").show();
   dc.renderAll();
}); //end survey_response/read
}); //end user/read
}; //end no-user if
}); //end campaign/read
}); //end onChange for #campaign_select
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

//show or hide urn on demand
$('a[id="hidePersonal"]').click(function () {
    $("#user-table tr th:nth-child(2)").toggle(this.checked);
    $("#user-table tr th:nth-child(3)").toggle(this.checked);
    $("#user-table tr td:nth-child(2)").toggle(this.checked);
    $('#user-table tr td:nth-child(3)').toggle(this.checked);
    var text = $('#hidePersonal_text').text();
     $('#hidePersonal_text').text( text == "Show" ? "Hide" : "Show");
});
}); //end of index.js-wide function
