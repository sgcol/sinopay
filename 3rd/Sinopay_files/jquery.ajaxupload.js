
$.extend({
    file: null,
    fileparent: null,
    createUploadIframe: function(id, uri){
        //create frame
        var frameId = 'jUploadFrame' + id;
        var iframeHtml = '<iframe id="' + frameId + '" name="' + frameId + '" style="position:absolute; top:-9999px; left:-9999px"';
        if (window.ActiveXObject) {
            if (typeof uri == 'boolean') {
                iframeHtml += ' src="' + 'javascript:false' + '"';
                
            } else if (typeof uri == 'string') {
                iframeHtml += ' src="' + uri + '"';
                
            }
        }
        iframeHtml += ' />';
        $(iframeHtml).appendTo(document.body);
        return $('#' + frameId).get(0);
    },
    createUploadForm: function(id, fileElementId, data){
        //create form	
        var formId = 'jUploadForm' + id;
        var form = $('<form  action="" method="POST" name="' + formId + '" id="' + formId + '" enctype="multipart/form-data"></form>');
        if (data) {
            for (var i in data) {
				if(typeof(data[i])=="object"){
					for(var j in data[i]){
						$('<input/>')
							.attr({
								'type':'hidden',
								'name':i,
								'value':data[i][j]
							}).appendTo(form);
					}
				}else{
					$('<input/>')
							.attr({
								'type':'hidden',
								'name':i,
								'value':data[i]
							}).appendTo(form);
				}
            }
        }
        $.file = $('#' + fileElementId);
        $.fileparent = $.file.parent();
        $.file.appendTo(form);
        
        //set attributes
        $(form).css('position', 'absolute');
        $(form).css('top', '-1200px');
        $(form).css('left', '-1200px');
        $(form).appendTo('body');
        return form;
    },
    
    ajaxFileUpload: function(s){
        // TODO introduce global settings, allowing the client to modify them for all requests, not only timeout		
        s = $.extend({}, $.ajaxSettings, s);
        var id = new Date().getTime()
        var form = $.createUploadForm(id, s.fileElementId, (typeof(s.data) == 'undefined' ? false : s.data));
        var io = $.createUploadIframe(id, s.secureuri);
        var frameId = 'jUploadFrame' + id;
        var formId = 'jUploadForm' + id;
        // Watch for a new set of requests
        if (s.global && !$.active++) {
            $.event.trigger("ajaxStart");
        }
        var requestDone = false;
        // Create the request object
        var xml = {}
        if (s.global) 
            $.event.trigger("ajaxSend", [xml, s]);
        // Wait for a response to come back
        var uploadCallback = function(isTimeout){
            var io = document.getElementById(frameId);
            try {
                if (io.contentWindow) {
                    xml.responseText = io.contentWindow.document.body ? io.contentWindow.document.body.innerHTML : null;
                    xml.responseXML = io.contentWindow.document.XMLDocument ? io.contentWindow.document.XMLDocument : io.contentWindow.document;
                    
                } else if (io.contentDocument) {
                    xml.responseText = io.contentDocument.document.body ? io.contentDocument.document.body.innerHTML : null;
                    xml.responseXML = io.contentDocument.document.XMLDocument ? io.contentDocument.document.XMLDocument : io.contentDocument.document;
                }
            } 
            catch (e) {
                $.handleError(s, xml, null, e);
                $.file.appendTo($.fileparent);
            }
            if (xml || isTimeout == "timeout") {
                requestDone = true;
                var status;
                try {
                    status = isTimeout != "timeout" ? "success" : "error";
                    // Make sure that the request was successful or notmodified
                    if (status != "error") {
                        // process the data (runs the xml through httpData regardless of callback)
                        var data = $.uploadHttpData(xml, s.dataType);
                        // If a local callback was specified, fire it and pass it the data
                        if (s.success) 
                            s.success(data, status);
                        
                        // Fire the global callback
                        if (s.global) 
                            $.event.trigger("ajaxSuccess", [xml, s]);
                    } else {
                        $.handleError(s, xml, status);
                        $.file.appendTo($.fileparent);
                    }
                } 
                catch (e) {
                    status = "error";
                    $.handleError(s, xml, status, e);
                    $.file.appendTo($.fileparent);
                }
                
                // The request was completed
                if (s.global) 
                    $.event.trigger("ajaxComplete", [xml, s]);
                
                // Handle the global AJAX counter
                if (s.global && !--$.active) 
                    $.event.trigger("ajaxStop");
                
                // Process result
                if (s.complete) 
                    s.complete(xml, status);
                
                $(io).unbind()
                
                setTimeout(function(){
                    try {
                        $(io).remove();
                        $(form).remove();
                    } 
                    catch (e) {
                        $.handleError(s, xml, null, e);
                        $.file.appendTo($.fileparent);
                    }
                    
                }, 100)
                
                xml = null;
                $.file.appendTo($.fileparent);
            }
        }
        // Timeout checker
        if (s.timeout > 0) {
            setTimeout(function(){
                // Check to see if the request is still happening
                if (!requestDone) 
                    uploadCallback("timeout");
            }, s.timeout);
        }
        try {
        
            var form = $('#' + formId);
            $(form).attr('action', s.url);
            $(form).attr('method', 'POST');
            $(form).attr('target', frameId);
            if (form.encoding) {
                $(form).attr('encoding', 'multipart/form-data');
            } else {
                $(form).attr('enctype', 'multipart/form-data');
            }
            $(form).submit();
            
        } 
        catch (e) {
            $.handleError(s, xml, null, e);
            $.file.appendTo($.fileparent);
        }
        
        $('#' + frameId).load(uploadCallback);
        //$.file.appendTo($.fileparent);
        return {
            abort: function(){
                //function
            }
        };
    },
    
    uploadHttpData: function(r, type){
        var data = !type;
        data = type == "xml" || data ? r.responseXML : r.responseText;
        // If the type is "script", eval it in global context
        if (type == "script") 
            $.globalEval(data);
        // Get the JavaScript object, if JSON is used.
        if (type == "json") 
            eval("data = " + data);
        // evaluate scripts within html
        if (type == "html") 
            $("<div>").html(data).evalScripts();
        
        return data;
    },
    handleError: function( s, xhr, status, e )      {  
        // If a local callback was specified, fire it  
                if ( s.error ) {  
                    s.error.call( s.context || s, xhr, status, e );  
                }  
  
                // Fire the global callback  
                if ( s.global ) {  
                    (s.context ? jQuery(s.context) : jQuery.event).trigger( "ajaxError", [xhr, s, e] );  
                }  
    } 
})
