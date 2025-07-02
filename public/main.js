$("#auth-form").on("submit", function (event) {
    event.preventDefault();

    const email = $("#email").val().trim();
    const password = $("#password").val().trim();
    if (email && password) {
        $.post("/", {email: email, password: password})
        .done(function(data) {
            if (data == "ok"){
                M.toast({ html: 'Авторизация прошла успешно', classes: 'green rounded' });
                reload(true);
            }
            else {
                M.toast({ html: 'Неправильный логин или пароль!', classes: 'red rounded' });
                $("#email").val("");
                $("#password").val("");
            }
        })
        .fail (function(error){
            //showToast("Произошла ошибка авторизации.", "danger");
            console.error("Ошибка при запросе:", error);
        })
    }
    else{
        //showToast("Пожалуйста, введите Email и пароль!", "danger")
    }
});

function reload(success) {
    if (success) {
        location.reload(); // Перезагружаем страницу при успешной авторизации   
    }else{
        
    }
 }

