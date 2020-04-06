

var emailVerificationService = {
	call: function(enrollmentHost, params, returnTo) {
		var url = location.protocol+"//"+enrollmentHost+"/email-verifications";
		var paramString = JSON.stringify(params);
		$.ajax({
			type: "POST",
			contentType: "application/json",
			dataType: "json",
			url: url,
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
				if (e.responseJSON && e.responseJSON.errors) {
					if (e.responseJSON.errors[0].causeMessage) {

						setTimeout(function(){ 
							growler.error("Identity Creation Failed", e.responseJSON.errors[0].causeMessage);
						}, 1000);

					} else if (e.responseJSON.errors[0].msg) {

						setTimeout(function(){ 
							growler.error("Email Verification Failed", e.responseJSON.errors[0].msg);
						}, 1000);

					} 
				} 
			},
			success: returnTo
		});
	}
}