/*
Copyright 2020 NetFoundry, Inc.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
https://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
var page;

$(document).ready(function(e) {
	app.init();
});

var app = {
	init: function() {
		app.events();
		app.setupLock();
		app.binding();
		if (growler) growler.init();
		if (page) page.init();
		if (header) header.init();
		if (user) user.init();
		if (modal) modal.init();
		if (dragging) dragging.init();
		if (tags) tags.init();
		if (settings) settings.init();
		if (restrictions) restrictions.init();
 	},
	events: function() {
		if (localStorage.getItem("hideTags")=="yes") $("#TagArea").addClass("hidden");
		$("input").on("keyup", app.enter);
		$("select").on("keyup", app.enter);
		$(".lock").click(app.lock);
		$(".toggle").click(app.toggle);
		$("main").mouseover(app.hideNav);
		$("body").keyup(app.keypress);
		context.addListener(settings.name, app.settingsReturned);
		context.addListener("version", app.versionReturned);
	},
	keypress: function(e) {
		if (e.keyCode === 27) {
			modal.close();
		}
		if (e.keyCode == 13) {
			if ($("#ConfirmModal").hasClass("open")) {
				$("#YesButton").click();
			}
		}
	},
	postLoad: function() {
		$(".selector").off("click");
		$(".selector").click(app.select);
		$(".dots").click(app.dots);
		if (window.location.href.endsWith("#a")) page.add();
		$(".col").each(function(i, obj) {
			var value = $(obj).text().split('\n').join(' ').split('  ').join(' ').split('"').join('');
			if (!$(obj).hasClass("notitle")&&!$(obj).hasClass("allowOver")&&!$(obj).parent().hasClass("template")) $(obj).attr("title", value);
		});
	},
	settingsReturned: function() {
		var edges = settings.data.edgeControllers;
		var fabrics = settings.data.fabricControllers;
		if (fabrics.length>0) {
			$(".iffabric").removeClass("disabled");
		} else {
			$(".iffabric").addClass("disabled");
		}
	},
	versionReturned: function(e) {
		if (settings.versionData&&settings.versionData.data&&settings.versionData.data.version) {
			$("#Version").html("v"+settings.versionData.data.version.replace(/v/g, ""));	// remove potential extra "v"
		}
	},
	dots: function(e) {
		var menu = $(e.currentTarget).children(".gridMenu");
		if (menu.hasClass("open")) menu.removeClass("open");
		else {
			$(".gridMenu.open").removeClass("open");
			menu.addClass("open");
		}
	},
	enter: function(e) {
		if (e.keyCode == 13) {
			var id = $(e.currentTarget).data("enter");
			if ($("#"+id).length>0) $("#"+id).click();
		}
	},
	binding: function() {
		if (page&&page.binding) {
			var props = Object.entries(page.binding);
			props.forEach(entry => {
				var key = entry[0];
				var value = entry[1];
				$('*[data-bind="'+key+'"]').html(value);
			});
		}
	},
	hideNav: function(e) {
		var isLocked = context.get("locked");
		if (!isLocked) header.close();
	},
	setupLock: function() {
		var isLocked = context.get("locked");
		if (isLocked==null||isLocked==undefined||isLocked.toString().trim().length==0) {
			isLocked = "true";
			context.set("locked","true");
		}
		if (isLocked=="true") $(".lock").addClass("locked");
		else $(".lock").removeClass("locked");
	},
	lock: function() {
		var isLocked = $(".lock").hasClass("locked");
		if (isLocked) {
			$(".lock").removeClass("locked");
			context.set("locked", "false");
		} else {
			$(".lock").addClass("locked");
			context.set("locked", "true");
		}
	},
	toggle: function(e) {
		// Normally in extended UI controls
		if ($(e.currentTarget).hasClass("on")) {
			$(e.currentTarget).removeClass("on");
		} else {
			$(e.currentTarget).addClass("on");
		}
	},
	select: function(e) {
		var selector = $(e.currentTarget);
		if (selector.hasClass("selected")) {
			selector.removeClass("selected");
			if (selector.hasClass("all")) $(".selector").removeClass("selected");
			else {
				if ($(".rows").find(".selector.selected").length==0) {
					if ($(".head").find(".selector.selected").hasClass("all")) $(".head").find(".selector.selected").removeClass("selected");
				}
			}
		} else {
			selector.addClass("selected");
			if (selector.hasClass("all")) $(".selector").addClass("selected");
			if ($(".rows").find(".selector.selected").length==page.data.length) $(".head").find(".selector").addClass("selected");
		}
		app.setAction();
	},
	setAction() {
		if ($(".rows").find(".selector.selected").length>0) {
			$(".action").removeClass("icon-add");
			$(".action").addClass("icon-minus");
			$(".action").addClass("remove");
			$(".action").data("action", "remove");
		} else {
			$(".action").addClass("icon-add");
			$(".action").removeClass("icon-minus");
			$(".action").removeClass("remove");
			$(".action").data("action", "add");
		}
	},
	reset: function() {
		$(".action").addClass("icon-add");
		$(".action").removeClass("icon-minus");
		$(".action").removeClass("remove");
		$(".action").data("action", "add");
	},
	areas: [{
		name: "Ziti Policies",
		sections: [
			{name:"Edge Router Policies", url: "/router-polocies", singular: "Router Policy", plural: "Router Policies", data: "edge-router-policies" },
			{name:"Service Policies", url: "/service-polocies", singular: "Service Policy", plural: "Service Policies", data: "service-policies" }
		]
	}]
}