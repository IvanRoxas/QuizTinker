from django.core.mail import send_mail
from django.conf import settings


def send_otp_email_task(user_email: str, otp_code: str) -> None:
    """
    Send a login OTP to the user's email address.

    Enqueue with:
        from django_q.tasks import async_task
        async_task('accounts.tasks.send_otp_email_task', user.email, otp.code)
    """
    subject = "Your QuizTinker Login Code"

    plain_message = (
        f"Your one-time login code is: {otp_code}\n\n"
        f"This code expires in 5 minutes.\n"
        f"If you did not request this, please ignore this email."
    )

    html_message = f"""
    <div style="
        font-family: 'Segoe UI', Arial, sans-serif;
        max-width: 480px;
        margin: 0 auto;
        background: #0f0f1a;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid #2a2a3d;
    ">
        <!-- Header -->
        <div style="
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            padding: 32px 40px 24px;
            border-bottom: 1px solid #2a2a3d;
        ">
            <h1 style="
                margin: 0;
                font-size: 22px;
                font-weight: 700;
                color: #ffffff;
                letter-spacing: -0.5px;
            ">QuizTinker</h1>
            <p style="
                margin: 6px 0 0;
                font-size: 13px;
                color: #8888aa;
                letter-spacing: 0.5px;
                text-transform: uppercase;
            ">Two-Factor Authentication</p>
        </div>

        <!-- Body -->
        <div style="padding: 36px 40px;">
            <p style="
                margin: 0 0 8px;
                font-size: 15px;
                color: #ccccdd;
                line-height: 1.6;
            ">Use the code below to complete your sign-in. It expires in <strong style="color:#fff">5 minutes</strong>.</p>

            <!-- OTP Box -->
            <div style="
                margin: 28px 0;
                text-align: center;
                background: #1a1a2e;
                border: 1px solid #3a3a5c;
                border-radius: 10px;
                padding: 28px 20px;
            ">
                <p style="
                    margin: 0 0 10px;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    color: #6666aa;
                ">Your one-time code</p>
                <p style="
                    margin: 0;
                    font-size: 42px;
                    font-weight: 800;
                    letter-spacing: 10px;
                    color: #7c6af7;
                    font-family: 'Courier New', monospace;
                ">{otp_code}</p>
            </div>

            <p style="
                margin: 0;
                font-size: 13px;
                color: #666688;
                line-height: 1.6;
            ">
                If you didn't try to sign in to QuizTinker, you can safely ignore this email.
                Someone may have typed your email address by mistake.
            </p>
        </div>

        <!-- Footer -->
        <div style="
            padding: 20px 40px;
            background: #0a0a14;
            border-top: 1px solid #1e1e30;
        ">
            <p style="
                margin: 0;
                font-size: 12px;
                color: #44446a;
                text-align: center;
            ">© QuizTinker · This is an automated security email, please do not reply.</p>
        </div>
    </div>
    """

    send_mail(
        subject=subject,
        message=plain_message,
        from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@quiztinker.com'),
        recipient_list=[user_email],
        html_message=html_message,
        fail_silently=False,
    )