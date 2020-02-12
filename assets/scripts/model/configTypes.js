/*
Copyright 2020 Netfoundry, Inc.
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
var configTypes = {
	name: "config-types",
	page: 1,
	limit: 25,
	data: [],
	meta: {},
	sort: "name",
	order: "ASC",
	filter: "",
	init: function() {
		this.events();
		this.get();
	},
	events: function() {
		$(".sort").click(this.doSort);
	},
	all: function() {
		this.limit = 500;
		this.get();
	},
	getParams: function() {
		return {
			type: this.name,
			paging: {
				page: this.page,
				total: this.limit,
				sort: this.sort,
				order: this.order,
				filter: this.filter
			}
		};
	},
	doSort: function(e) {
		var sortBy = $(e.currentTarget).data("by");
		if (configTypes.sort==sortBy) {
			if (configTypes.order=="ASC") configTypes.order = "DESC";
			else configTypes.order = "ASC";
		} else configTypes.order = "ASC";
		configTypes.sort = sortBy;
		$(".asc").removeClass("asc");
		$(".desc").removeClass("desc");
		$(e.currentTarget).addClass(configTypes.order.toLowerCase());
		configTypes.get();
	},
	get: function() {
		var params = this.getParams();
		service.call("data", params, this.getReturned);
	},
	getReturned: function(e) {
		if (e.error) growler.error("Error", e.error);
		if (e.data) {
			configTypes.data = e.data;
			configTypes.meta = e.meta;
			context.set(configTypes.name, configTypes.data);
		}
	},
	save: function(name, schema, tags, id) {
		var params = this.getParams();
		params.save = {
			name: name,
			schema: schema,
			tags: tags
		};
		if (id!=null&&id.trim().length>0) params.id = id;
		service.call("dataSave", params, this.saveReturned);
	},
	saveReturned: function(e) {
		if (e.data) {
			if (page) page.reset();
			modal.close();
			configTypes.data = e.data;
			configTypes.meta = e.meta;
			context.set(configTypes.name, configTypes.data);
		} else growler.error("Error saving "+configTypes.name, e.error);
	},
	details: function(id) {
		for (var i=0; i<this.data.length; i++) {
			if (this.data[i].id==id) return this.data[i];
		}
		return null;
	},
	delete: function(ids) {
		var params = this.getParams();
		params.ids = ids;
		service.call("delete", params, this.getReturned);
	},
	start: function() {
		if (this.page==1) return 1;
		else return ((this.page-1)*this.limit)+1;
	},
	end: function() {
		if (this.page==1) return this.data.length;
		else return (this.start()-1)+this.data.length;
	},
	total: function() {
		return this.meta.pagination.totalCount;
	},
	isFirst: function() {
		return this.meta.pagination.offset==0;
	},
	isLast: function() {
		return (this.meta.pagination.offset+this.meta.pagination.limit)>=this.meta.pagination.totalCount;
	},
	next: function() {
		if (!configTypes.isLast()) {
			configTypes.page = configTypes.page+1;
			configTypes.get();
		}
	},
	prev: function() {
		if (!configTypes.isFirst()) {
			configTypes.page = configTypes.page-1;
			configTypes.get();
		}
	}
}