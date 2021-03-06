

var service = {
	host: location.protocol+"//"+window.location.hostname+((window.location.port)?":"+window.location.port:""),
	base: "/api",
	call: function(name, params, returnTo, type) {
		if (!type) type = "POST";
		var paramString = JSON.stringify(params);
		$.ajax({
			type: type,
			contentType: "application/json",
			dataType: "json",
			url: service.host+service.base+"/"+name,
			data: paramString,
			async: true,
			beforeSend: function(e) {
				// Set indication of operation
			},
			error: function(e) {
				// Process Error
				if (console) console.log(e);
			},
			complete: function(e) {
				// Set indication of operation Complete
				if (e.responseJSON&&e.responseJSON.error&&e.responseJSON.error.code&&e.responseJSON.error.code=="ECONNREFUSED") {
					growler.error("Cannot Reach Server", "Logging out");
					setTimeout(function() {
						window.location = "/login";
					}, 2000);
				} else {
					if (e.responseJSON&&e.responseJSON.error&&e.responseJSON.error=="loggedout") {
						growler.error("Cannot Reach Server", "Logging out");
						setTimeout(function() {
							window.location = "/login";
						}, 2000);
					} else {
						try {
							if (e.responseJSON.error!=null&&e.responseJSON.error.indexOf("credentials are invalid")>0) {
								growler.error("Cannot Reach Server", e.responseJSON.error);
								setTimeout(function() {
									window.location = "/login";
								}, 2000);
							}
						} catch (e) {
							
						}
					}
				}
			},
			success: returnTo
		});
	}
}